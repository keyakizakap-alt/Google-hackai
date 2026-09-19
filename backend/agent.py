"""逆転コンシェルジュの自律エージェントループ。

assess → discover → compose → verify →（不合格があれば）repair → reverify。
LLM が担うのは assess / compose / repair で、discover と verify は決定的に処理する。
「提案の材料」と「提案の検算」を LLM の外に置くことで、
ハルシネーションした提案がユーザーに届かない構造にしている。

スポットの供給元（静的カタログ / Places API）は catalog.load() が吸収するため、
このモジュールは SpotSet だけを見ていればよい。
"""

import asyncio
import json
import os
import time
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

from google import genai
from google.genai import types

import catalog
import obs
import signals
from schemas import Constraints, PlanSet, RecoveryRequest

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
# 非機能要件の応答3秒/最大5秒に合わせ、1呼び出しあたりで打ち切る
LLM_TIMEOUT_SEC = float(os.environ.get("LLM_TIMEOUT_SEC", "5"))
MAX_REPAIR_ROUNDS = 1
JST = timezone(timedelta(hours=9))

TROUBLE_JA = {
    "rain": "雨が降ってきた",
    "transit_down": "電車が止まった・運行見合わせ",
    "crowded": "目的地が混みすぎている",
    "closed": "行くはずの施設が閉まっていた",
    "unwell": "体調がすぐれない",
    "free_text": "自由記述のトラブル",
}

ASSESS_SYSTEM = """あなたは旅行中のトラブル対応を専門とするコンシェルジュAIの「状況把握」担当です。
ユーザーが今どういう状態に置かれているかを読み取り、代替プランを探すための制約条件を決めてください。

判断の指針:
- max_travel_minutes は「その都道府県の拠点駅からの移動時間の上限(分)」。
  県内を公共交通で動く前提なので、30〜120分の範囲で決める
- 雨・体調不良なら indoor_required を true にする
- 体調不良なら max_travel_minutes を短く(30分以内)、予算も抑えめにする
- 電車が止まっている場合は遠出できないので max_travel_minutes を45分以内にし、
  indoor_required を true 寄りにする
- 混雑が理由なら avoid_tags に "混雑しやすい" を入れる
- prefer_tags には「その状況だからこそ価値が上がるタグ」を入れる(雨なら "雨でも快適" など)
- max_spend_yen は残予算を全部使い切らず、1スポットあたりの上限として現実的な額にする
- 残り時間が短いときは max_travel_minutes をその1/3程度まで下げる。
  移動で時間を使い切ると現地で何もできない

reasoning には、なぜその制約にしたのかを日本語1〜2文で簡潔に書いてください。"""

COMPOSE_SYSTEM = """あなたは旅行中のトラブル対応を専門とするコンシェルジュAIの「プラン構成」担当です。
与えられた候補スポットだけを使って、性格の異なるリカバリープランを3つ作ってください。

厳守事項:
- spot_id は必ず候補リストにあるものだけを使う。候補にないIDや施設名を創作してはいけない
- 3つのプランはそれぞれ別の方向性にする(例: 体験重視 / グルメ重視 / ゆったり休憩)
- 残り時間に収まるよう stay_minutes と arrive_after_minutes を組む
- arrive_after_minutes は「今から何分後にそこへ着くか」
- why_now には「そのトラブルが起きた今だからこそ、これが良い」という理由を1〜2文で書く
- title は15文字以内のキャッチーな日本語
- 候補が少なく3案を作ると内容が重複する場合は、無理に3案にせず作れる数だけ返す
- 同じスポットを複数のプランの主役にしない
- 残り時間が60分を切る場合は立ち寄り先を1箇所に絞り、移動が短い候補を優先する。
  「移動x分 + 滞在y分」が残り時間を超えないこと

トラブルを我慢させるのではなく、それがあったから得られる体験に変換してください。"""


def _client() -> genai.Client | None:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    return genai.Client(api_key=key) if key else None


def _now_hour() -> int:
    override = os.environ.get("DEMO_HOUR")
    return int(override) if override else datetime.now(JST).hour


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _llm_json(
    client: genai.Client,
    contents: str,
    system: str,
    schema: type,
    temperature: float,
    request_id: str,
):
    """Gemini を構造化出力で呼ぶ。失敗時は None を返して呼び出し側でフォールバックさせる。

    モデルが拒否したり JSON が壊れると resp.parsed が None になるため、
    例外だけでなく None も明示的に失敗として扱う。
    """
    try:
        resp = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=temperature,
                ),
            ),
            timeout=LLM_TIMEOUT_SEC,
        )
    except TimeoutError:
        obs.warn("llm.timeout", request_id=request_id, timeout_sec=LLM_TIMEOUT_SEC)
        return None
    except Exception as e:
        obs.warn("llm.error", request_id=request_id, error=type(e).__name__, detail=str(e)[:300])
        return None

    if resp.parsed is None:
        obs.warn("llm.unparsable", request_id=request_id)
    return resp.parsed


def _situation_lines(sit: signals.Situation) -> str:
    """外部シグナルをプロンプトに足す行。何も取れていなければ空。"""
    lines = []
    if sit.weather_text:
        lines.append(f"- 外部APIが検知した天気: {sit.weather_text}")
    if sit.transit_text:
        lines.append(f"- 外部APIが検知した運行状況: {sit.transit_text}")
    return ("\n" + "\n".join(lines)) if lines else ""


async def _assess(
    client: genai.Client | None,
    req: RecoveryRequest,
    sit: signals.Situation,
    request_id: str,
) -> tuple[Constraints, bool]:
    """戻り値の bool は Gemini の結果を使えたか（False ならフォールバック）。"""
    if client is None:
        return _assess_fallback(req, sit), False

    prompt = f"""状況:
- 発生したトラブル: {TROUBLE_JA.get(req.trouble.value, req.trouble.value)}
- ユーザーの補足: {req.note or "(なし)"}
- 現在いるエリア: {req.area}{_situation_lines(sit)}
- 残り時間: {req.minutes_left}分
- 残予算: {req.budget_yen}円
- 使える移動手段: {req.mobility.value}
- 同行者: {req.party}
- 現在時刻: {_now_hour()}時台

利用可能なタグ: 屋内, 屋外, 雨でも快適, 静か, 文化, 定番, 絶景, 混雑しやすい, 食べ歩き,
賑やか, ゆったり, 休憩, 体験, 思い出, 予約推奨, 体を温める, 体調回復, ファミリー,
写真映え, 無料, 散策, 夜, 食事, 交通結節点"""

    parsed = await _llm_json(client, prompt, ASSESS_SYSTEM, Constraints, 0.3, request_id)
    return (parsed, True) if parsed else (_assess_fallback(req, sit), False)


def _assess_fallback(req: RecoveryRequest, sit: signals.Situation | None = None) -> Constraints:
    """APIキーなしのデモモード用。ルールベースで同じ形の制約を作る。"""
    t = req.trouble.value
    indoor = t in ("rain", "unwell", "transit_down")
    # 申告が「雨」以外でも、外部APIが雨雪を検知していれば屋内に寄せる
    if sit and sit.weather in ("rain", "snow"):
        indoor = True
    # 都道府県スケールの移動時間。体調不良ほど近場に、運休時は遠出させない
    base = 30 if t == "unwell" else (45 if t == "transit_down" else 90)
    # 残り時間の大半を移動に使うと現地で何もできない。1/3を上限の目安にする
    walk = min(base, max(5, req.minutes_left // 3))
    avoid = ["混雑しやすい"] if t == "crowded" else []
    prefer = {
        "rain": ["雨でも快適", "屋内"],
        "unwell": ["体調回復", "休憩", "体を温める"],
        "transit_down": ["交通結節点", "休憩"],
        "crowded": ["静か", "ゆったり"],
        "closed": ["体験", "思い出"],
    }.get(t, ["雨でも快適"])
    return Constraints(
        indoor_required=indoor,
        max_travel_minutes=walk,
        max_spend_yen=max(500, req.budget_yen // 2),
        avoid_tags=avoid,
        prefer_tags=prefer,
        reasoning=f"{TROUBLE_JA.get(t, t)}のため、"
        + ("屋内で" if indoor else "")
        + f"移動{walk}分以内・1スポット{max(500, req.budget_yen // 2)}円以内に絞り込みました。",
    )


async def _compose(
    client: genai.Client | None,
    req: RecoveryRequest,
    c: Constraints,
    cands: list,
    request_id: str,
) -> tuple[PlanSet, bool]:
    if client is None:
        return _compose_fallback(req, cands), False

    listing = "\n".join(
        f"- id={s.id} / {s.name} / {s.category} / 移動{s.travel_minutes}分 / "
        f"{s.price_yen}円 / {s.open_hour}-{s.close_hour}時 / tags={','.join(s.tags)} / {s.blurb}"
        for s in cands
    )
    prompt = f"""トラブル: {TROUBLE_JA.get(req.trouble.value, req.trouble.value)}
ユーザーの補足: {req.note or "(なし)"}
残り時間: {req.minutes_left}分 / 残予算: {req.budget_yen}円 / 移動手段: {req.mobility.value}
同行者: {req.party} / 現在{_now_hour()}時台

状況把握担当の判断: {c.reasoning}

使用可能な候補スポット(このリスト以外は使用禁止):
{listing}"""

    parsed = await _llm_json(client, prompt, COMPOSE_SYSTEM, PlanSet, 0.9, request_id)
    return (parsed, True) if parsed else (_compose_fallback(req, cands), False)


def _fit_stay(minutes_left: int, picks: list) -> int:
    """残り時間に収まる滞在分数。立ち寄り先が増えるほど1件あたりは短くなる。"""
    travel = max((s.travel_minutes for s in picks), default=0)
    room = minutes_left - travel
    if room <= 0:
        return 0
    return max(5, min(60, room // max(1, len(picks))))


def _compose_fallback(req: RecoveryRequest, cands: list) -> PlanSet:
    """APIキーなしのデモモード用。候補を重複させずに振り分ける。

    候補が少ないときに同じ内容のプランを3つ並べると提案として無価値なので、
    作れる数だけ返す。残り時間が短いときは立ち寄り先を1件に絞る。
    """
    themes = [
        ("すぐ退避プラン", "とにかく濡れずに落ち着ける場所へ", "最短で退避できます。"),
        ("体験でとり返すプラン", "予定が崩れた時間を体験に変える", "屋内体験は天候に左右されません。"),
        ("ゆったり立て直しプラン", "休憩しながら次の判断をする", "無理に動かず状況を見極められます。"),
    ]
    # 1時間を切ると2箇所は回れないので、近い順に1件ずつ割り当てる
    tight = req.minutes_left < 60
    if tight:
        cands = sorted(cands, key=lambda s: s.travel_minutes)

    n = min(len(themes), len(cands))
    plans = []
    for i in range(n):
        picks = (
            [cands[i]]
            if tight
            # i番目のプランは i, i+n 番目の候補を使う（プラン間でスポットが重複しない）
            else [cands[j] for j in (i, i + n) if j < len(cands)]
        )
        stay = _fit_stay(req.minutes_left, picks)
        if stay == 0:
            continue  # そこへ行くだけで時間が尽きる

        title, concept, why = themes[i]
        plans.append(
            {
                "title": title,
                "concept": concept,
                "steps": [
                    {
                        "spot_id": s.id,
                        "arrive_after_minutes": s.travel_minutes,
                        "stay_minutes": stay,
                        "note": s.blurb,
                    }
                    for s in picks
                ],
                "why_now": why,
            }
        )
    return PlanSet.model_validate({"plans": plans})


REPAIR_SYSTEM = """あなたは旅行コンシェルジュAIの「自己修正」担当です。
先ほど作られたプランが検算で不合格になりました。指摘された理由を解消したプランを作り直してください。

厳守事項:
- spot_id は必ず候補リストにあるものだけを使う
- 指摘された理由を確実に潰す。時間超過なら滞在時間を削るか立ち寄り先を減らす。
  予算超過なら安いスポットに差し替える
- 不合格になったプランの方向性はできるだけ保ったまま、成立する形に落とす"""


async def _repair(
    client: genai.Client | None,
    req: RecoveryRequest,
    c: Constraints,
    cands: list,
    failed: list[dict],
    request_id: str,
) -> tuple[PlanSet, bool]:
    """検算に落ちたプランを、落ちた理由を添えて作り直させる。"""
    if client is None:
        return _repair_fallback(req, cands, failed), False

    listing = "\n".join(
        f"- id={s.id} / {s.name} / 移動{s.travel_minutes}分 / {s.price_yen}円 / "
        f"{s.open_hour}-{s.close_hour}時 / tags={','.join(s.tags)}"
        for s in cands
    )
    rejected = "\n".join(
        f"- 「{f['title']}」不合格の理由: {' / '.join(f['issues'])}" for f in failed
    )
    prompt = f"""残り時間: {req.minutes_left}分 / 残予算: {req.budget_yen}円 / 現在{_now_hour()}時台
状況把握担当の判断: {c.reasoning}

作り直しが必要なプランと理由:
{rejected}

使用可能な候補スポット(このリスト以外は使用禁止):
{listing}"""

    parsed = await _llm_json(client, prompt, REPAIR_SYSTEM, PlanSet, 0.5, request_id)
    return (parsed, True) if parsed else (_repair_fallback(req, cands, failed), False)


def _repair_fallback(req: RecoveryRequest, cands: list, failed: list[dict]) -> PlanSet:
    """デモモード用の自己修正。残り時間と予算に収まるよう機械的に詰め直す。

    時間が足りずに落ちた案が多いので、近い順に並べ直してから割り当てる。
    """
    reachable = sorted(
        (s for s in cands if s.price_yen <= req.budget_yen and s.travel_minutes < req.minutes_left),
        key=lambda s: s.travel_minutes,
    )
    plans = []
    for i, f in enumerate(failed):
        # 案ごとに別のスポットを充てる。尽きたら近いものを再利用する
        spot = reachable[i] if i < len(reachable) else (reachable[0] if reachable else None)
        if spot is None:
            continue
        stay = _fit_stay(req.minutes_left, [spot])
        if stay == 0:
            continue
        plans.append(
            {
                "title": f["title"],
                "concept": f["concept"],
                "steps": [
                    {
                        "spot_id": spot.id,
                        "arrive_after_minutes": spot.travel_minutes,
                        "stay_minutes": stay,
                        "note": spot.blurb,
                    }
                ],
                "why_now": f["why_now"],
            }
        )
    return PlanSet.model_validate({"plans": plans})


def _verify(plan, req: RecoveryRequest, spots, allowed: set[str], now_hour: int) -> dict:
    """LLM の出力を決定的に検算する。ここを通らない提案はユーザーに出さない。"""
    issues: list[str] = []
    steps_out: list[dict] = []
    elapsed = 0
    spend = 0

    for st in plan.steps:
        spot = spots.by_id.get(st.spot_id)
        if spot is None:
            issues.append(f"存在しないスポットID({st.spot_id})を検出し除外しました")
            continue
        if st.spot_id not in allowed:
            issues.append(f"{spot.name}は制約を満たさないため除外しました")
            continue

        arrive_hour = now_hour + (st.arrive_after_minutes // 60)
        if not (spot.open_hour <= arrive_hour < spot.close_hour):
            issues.append(f"{spot.name}は到着予定時刻に営業時間外のため除外しました")
            continue

        elapsed = max(elapsed, st.arrive_after_minutes) + st.stay_minutes
        spend += spot.price_yen
        steps_out.append(
            {
                **catalog.as_dict(spot),
                "arrive_after_minutes": st.arrive_after_minutes,
                "stay_minutes": st.stay_minutes,
                "note": st.note,
            }
        )

    if elapsed > req.minutes_left:
        issues.append(f"所要{elapsed}分が残り時間{req.minutes_left}分を超過しています")
    if spend > req.budget_yen:
        issues.append(f"概算{spend}円が予算{req.budget_yen}円を超過しています")

    return {
        "title": plan.title,
        "concept": plan.concept,
        "why_now": plan.why_now,
        "steps": steps_out,
        "total_minutes": elapsed,
        "total_yen": spend,
        "passed": bool(steps_out) and elapsed <= req.minutes_left and spend <= req.budget_yen,
        "issues": issues,
    }


async def run(req: RecoveryRequest, request_id: str | None = None) -> AsyncIterator[str]:
    """エージェントループ本体。各段の開始と完了を SSE イベントとして流す。"""
    request_id = request_id or uuid.uuid4().hex[:16]
    started = time.perf_counter()
    client = _client()
    now_hour = _now_hour()
    mode = "gemini" if client else "demo"

    obs.info(
        "recover.start",
        request_id=request_id,
        mode=mode,
        model=MODEL if client else None,
        trouble=req.trouble.value,
        minutes_left=req.minutes_left,
        budget_yen=req.budget_yen,
        mobility=req.mobility.value,
    )

    yield _sse(
        "start",
        {"mode": mode, "model": MODEL if client else None, "hour": now_hour, "request_id": request_id},
    )

    # 0. 外部シグナルの検知（設定されている場合だけ）
    sit = signals.Situation()
    if signals.is_enabled():
        yield _sse("step", {"id": "detect", "state": "running", "label": "現地の状況を確認しています"})
        with obs.stage("detect", request_id) as s:
            sit = await signals.detect(req.area, request_id)
            s["sources"] = sit.sources
        detected = " / ".join(x for x in (sit.weather_text, sit.transit_text) if x)
        yield _sse(
            "step",
            {
                "id": "detect",
                "state": "done",
                "label": detected or "外部APIからは取得できませんでした",
                "detail": {"situation": sit.as_dict()},
            },
        )

    # 1. 状況把握
    yield _sse("step", {"id": "assess", "state": "running", "label": "状況を読み解いています"})
    with obs.stage("assess", request_id) as s:
        constraints, by_llm = await _assess(client, req, sit, request_id)
        s["by_llm"] = by_llm
    yield _sse(
        "step",
        {
            "id": "assess",
            "state": "done",
            "label": "制約条件を決定",
            "detail": constraints.model_dump(),
        },
    )

    # 2. 候補探索（供給元から取得し、決定的に絞り込む。LLMを通さない）
    yield _sse("step", {"id": "discover", "state": "running", "label": "行ける場所を探しています"})
    with obs.stage("discover", request_id) as s:
        spots = await catalog.load(req.area, request_id)
        cands = spots.search(constraints, req.mobility.value, now_hour)
        s["source"] = spots.source
        s["pool"] = len(spots.spots)
        s["candidates"] = len(cands)
    yield _sse(
        "step",
        {
            "id": "discover",
            "state": "done",
            "label": f"候補{len(cands)}件を抽出",
            "detail": {"spots": [catalog.as_dict(s) for s in cands], "source": spots.source},
        },
    )

    if not cands:
        obs.warn("recover.no_candidates", request_id=request_id)
        yield _sse(
            "error",
            {"message": "条件に合う候補が見つかりませんでした。時間や予算を広げてください。"},
        )
        return

    # 3. プラン構成
    yield _sse("step", {"id": "compose", "state": "running", "label": "逆転プランを組み立て中"})
    with obs.stage("compose", request_id) as s:
        planset, by_llm = await _compose(client, req, constraints, cands, request_id)
        s["by_llm"] = by_llm
        s["plans"] = len(planset.plans)
    yield _sse(
        "step",
        {"id": "compose", "state": "done", "label": f"{len(planset.plans)}案を生成"},
    )

    # 4. 自己検証（決定的・LLMの出力を検算）
    allowed = {s.id for s in cands}
    yield _sse("step", {"id": "verify", "state": "running", "label": "提案を検算しています"})
    with obs.stage("verify", request_id) as s:
        verified = [_verify(p, req, spots, allowed, now_hour) for p in planset.plans]
        failed = [v for v in verified if not v["passed"]]
        s["passed"] = len(verified) - len(failed)
        s["failed"] = len(failed)
    yield _sse(
        "step",
        {
            "id": "verify",
            "state": "done",
            "label": f"{len(verified) - len(failed)}案が通過 / {len(failed)}案が不合格"
            if failed
            else "全案が検算を通過",
        },
    )

    # 5. 自己修正（検算に落ちた案だけを、落ちた理由を添えて作り直す）
    repaired_count = 0
    for _ in range(MAX_REPAIR_ROUNDS):
        if not failed:
            break

        yield _sse(
            "step",
            {
                "id": "repair",
                "state": "running",
                "label": f"{len(failed)}案が成立しないため作り直しています",
            },
        )
        with obs.stage("repair", request_id) as s:
            fixed_set, by_llm = await _repair(client, req, constraints, cands, failed, request_id)
            s["by_llm"] = by_llm
        yield _sse(
            "step",
            {"id": "repair", "state": "done", "label": f"{len(fixed_set.plans)}案を作り直し"},
        )

        yield _sse("step", {"id": "reverify", "state": "running", "label": "作り直した案を再検算"})
        with obs.stage("reverify", request_id) as s:
            rechecked = [_verify(p, req, spots, allowed, now_hour) for p in fixed_set.plans]
            recovered = [v for v in rechecked if v["passed"]]
            failed = [v for v in rechecked if not v["passed"]]
            s["recovered"] = len(recovered)
            s["still_failed"] = len(failed)
        repaired_count = len(recovered)
        verified = [v for v in verified if v["passed"]] + recovered
        yield _sse(
            "step",
            {
                "id": "reverify",
                "state": "done",
                "label": f"{len(recovered)}案が成立する形に回復"
                if recovered
                else "回復できた案はありませんでした",
            },
        )

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    passed = [v for v in verified if v["passed"]]

    obs.info(
        "recover.done",
        request_id=request_id,
        mode=mode,
        trouble=req.trouble.value,
        elapsed_ms=elapsed_ms,
        plans_delivered=len(passed),
        repaired=repaired_count,
        rejected=len(failed),
    )

    yield _sse(
        "result",
        {
            "plans": passed,
            "rejected": failed,
            "repaired": repaired_count,
            "elapsed_ms": elapsed_ms,
            "request_id": request_id,
        },
    )

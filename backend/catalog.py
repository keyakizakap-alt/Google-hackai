"""スポットカタログ。

LLM はここに載っているスポットしか提案できない（ハルシネーション防止の要）。
本番では Google Places API 等の実データに差し替える前提の、同じ形の疑似データ。
営業時間・料金はデモ用の概算値。
"""

from dataclasses import asdict, dataclass

from schemas import Constraints


@dataclass(frozen=True)
class Spot:
    id: str
    name: str
    category: str
    indoor: bool
    walk_minutes: int
    open_hour: int
    close_hour: int
    price_yen: int
    tags: tuple[str, ...]
    blurb: str


CATALOG: tuple[Spot, ...] = (
    Spot(
        "kyoto-nat-museum",
        "京都国立博物館",
        "museum",
        True,
        8,
        9,
        17,
        700,
        ("屋内", "雨でも快適", "静か", "文化"),
        "全天候型。企画展の入れ替えがあり、雨天でも半日つぶせる規模。",
    ),
    Spot(
        "sanjusangendo",
        "三十三間堂",
        "temple",
        True,
        12,
        8,
        17,
        600,
        ("屋内", "雨でも快適", "定番", "文化"),
        "千手観音像が並ぶ堂内は全て屋内。移動距離が短く雨宿りを兼ねられる。",
    ),
    Spot(
        "kiyomizu",
        "清水寺",
        "temple",
        False,
        18,
        6,
        18,
        500,
        ("屋外", "定番", "絶景", "混雑しやすい"),
        "王道。雨天は石畳が滑りやすく、混雑時は参道の通行に時間がかかる。",
    ),
    Spot(
        "nishiki-market",
        "錦市場",
        "food",
        True,
        22,
        10,
        18,
        2000,
        ("屋内", "雨でも快適", "食べ歩き", "賑やか"),
        "アーケードで雨に濡れない。食べ歩きで小腹を満たしながら時間調整できる。",
    ),
    Spot(
        "kyoto-teramachi-cafe",
        "寺町の町家カフェ",
        "cafe",
        True,
        20,
        9,
        20,
        1200,
        ("屋内", "雨でも快適", "ゆったり", "休憩"),
        "町家を改装した落ち着いた空間。荒天時の待機場所として機能する。",
    ),
    Spot(
        "gion-machiya-craft",
        "祇園の和菓子づくり体験",
        "experience",
        True,
        14,
        10,
        17,
        3500,
        ("屋内", "雨でも快適", "体験", "思い出", "予約推奨"),
        "60分完結の和菓子づくり。天候に左右されず、雨の日ほど価値が上がる体験。",
    ),
    Spot(
        "kyoto-tower-onsen",
        "京都タワー大浴場",
        "onsen",
        True,
        25,
        7,
        22,
        1000,
        ("屋内", "雨でも快適", "体を温める", "体調回復"),
        "駅前で朝から深夜まで営業。冷えた体を立て直すのに向く。",
    ),
    Spot(
        "kyoto-aquarium",
        "京都水族館",
        "museum",
        True,
        35,
        10,
        18,
        2400,
        ("屋内", "雨でも快適", "ファミリー", "写真映え"),
        "全館屋内。天候が崩れた日の受け皿として機能する規模。",
    ),
    Spot(
        "philosopher-path",
        "哲学の道",
        "walk",
        False,
        40,
        0,
        24,
        0,
        ("屋外", "無料", "静か", "散策"),
        "晴天時の散策向き。雨天や強風時は体験価値が大きく下がる。",
    ),
    Spot(
        "kyoto-kimono-studio",
        "着物レンタル＆写真スタジオ",
        "experience",
        True,
        16,
        9,
        18,
        5000,
        ("屋内", "雨でも快適", "体験", "写真映え", "予約推奨"),
        "屋内撮影プランなら雨天でも成立。所要は着付け込みで90分前後。",
    ),
    Spot(
        "pontocho-izakaya",
        "先斗町の路地居酒屋",
        "food",
        True,
        24,
        17,
        23,
        4000,
        ("屋内", "夜", "食事", "賑やか"),
        "夕方以降のみ営業。夜の予定が崩れたときの受け皿。",
    ),
    Spot(
        "kyoto-station-lounge",
        "京都駅の待合ラウンジ",
        "rest",
        True,
        30,
        6,
        23,
        800,
        ("屋内", "雨でも快適", "休憩", "交通結節点"),
        "運行再開待ちの待機に向く。電源とWi-Fiがあり移動判断がしやすい。",
    ),
    # --- 近距離帯（徒歩10分以内）。体調不良や強雨など、動ける範囲が狭いときの受け皿 ---
    Spot(
        "higashiyama-teahouse",
        "東山の甘味処",
        "cafe",
        True,
        4,
        10,
        18,
        900,
        ("屋内", "雨でも快適", "休憩", "ゆったり", "体を温める"),
        "温かい甘味で一息つける。席数が多く待たずに座れることが多い。",
    ),
    Spot(
        "higashiyama-footbath",
        "東山の足湯サロン",
        "onsen",
        True,
        6,
        10,
        20,
        800,
        ("屋内", "雨でも快適", "体を温める", "体調回復", "休憩"),
        "着替え不要で15分から利用できる。歩き疲れの回復に向く。",
    ),
    Spot(
        "kiyomizu-michi-soba",
        "清水道の蕎麦処",
        "food",
        True,
        7,
        11,
        20,
        1400,
        ("屋内", "雨でも快適", "食事", "静か"),
        "温かい蕎麦で体を戻せる。回転が速く長居しなくても成立する。",
    ),
    Spot(
        "yasaka-incense-studio",
        "八坂の匂い袋づくり",
        "experience",
        True,
        9,
        10,
        17,
        2200,
        ("屋内", "雨でも快適", "体験", "思い出", "静か"),
        "30分完結の香り調合体験。座ったままできるので消耗が少ない。",
    ),
    Spot(
        "gion-bookcafe",
        "祇園のブックカフェ",
        "cafe",
        True,
        10,
        8,
        21,
        1100,
        ("屋内", "雨でも快適", "静か", "休憩", "ゆったり"),
        "朝から夜まで通し営業。天候待ち・運行再開待ちの拠点にしやすい。",
    ),
)

BY_ID: dict[str, Spot] = {s.id: s for s in CATALOG}


def search(c: Constraints, mobility: str, now_hour: int) -> list[Spot]:
    """制約に合うスポットだけを決定的に絞り込む（LLM を通さない）。"""
    # タクシー/車なら徒歩上限を実質的に緩める
    reach = c.max_walk_minutes * (3 if mobility in ("taxi", "car") else 1)

    hits = []
    for s in CATALOG:
        if c.indoor_required and not s.indoor:
            continue
        if s.walk_minutes > reach:
            continue
        if s.price_yen > c.max_spend_yen:
            continue
        if not (s.open_hour <= now_hour < s.close_hour):
            continue
        if any(t in s.tags for t in c.avoid_tags):
            continue
        hits.append(s)

    def score(s: Spot) -> tuple[int, int]:
        pref = sum(1 for t in c.prefer_tags if t in s.tags)
        return (-pref, s.walk_minutes)

    return sorted(hits, key=score)


def as_dict(s: Spot) -> dict:
    d = asdict(s)
    d["tags"] = list(s.tags)
    return d

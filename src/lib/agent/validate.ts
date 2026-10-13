import { overlapsBusy } from "../availability";
import type { BusyBlock } from "../privacy/mask";
import { BEAUTY_GUIDELINES } from "../services/beauty";
import { formatJst, jstDayDiff, MS_MIN } from "../time";
import { normalizeForMatch, textMentionsPrice } from "../services/webSearchMatch";
import { BEAUTY_SERVICES, type BeautyService, type OshiEvent, type TimelineItem, type WebSearchRecord } from "./types";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const isBeautyService = (c?: string): c is BeautyService => !!c && (BEAUTY_SERVICES as readonly string[]).includes(c);

/**
 * 要約に「予約・決済を済ませた」と受け取れる書き方がないかを調べる。
 * エージェントには予約・決済の手段がないので、そう書かれていれば事実ではない（指示に乗せられた可能性もある）。
 */
export const CLAIMS_EXECUTED = /(予約|決済|支払い?|購入)(を)?(しました|済ませました|完了しました|が完了|完了です)|(予約|決済)完了/;

export function validateSummary(summary: string): string[] {
  return CLAIMS_EXECUTED.test(summary)
    ? ["summary に予約・決済を実行したような書き方があります。あなたは予約・決済をしていません。「提案」として書き直してください"]
    : [];
}

/** Google 検索で見つけたもの（この回の検索結果の本文と出典の URL）。名前・価格が検索結果にあるかの照合に使う */
export interface WebEvidence {
  text: string;
  urls: ReadonlySet<string>;
}

/** Google 検索の結果を、検査で照合できる形にする */
export function webEvidenceOf(records: readonly WebSearchRecord[] | undefined): WebEvidence | undefined {
  if (!records?.length) return undefined;
  return { text: records.map((r) => r.text).join("\n"), urls: new Set(records.flatMap((r) => r.sources.map((s) => s.uri))) };
}

/**
 * 検索で見つけた店舗・宿・便として書かれた項目の検査。
 * 出典の URL がこの回の検索結果にあり、名前・便名・価格が検索結果の本文に書かれているものだけを通す（AI に作らせない）。
 */
function checkWebSourced(it: TimelineItem, evidence: WebEvidence | undefined, errors: string[]) {
  const sourceUrl = it.route?.source === "web" ? it.route.sourceUrl : it.provider?.sourceUrl;
  const usesWeb = Boolean(it.provider?.sourceUrl) || it.route?.source === "web";
  if (!usesWeb) return;
  const fail = (why: string) => errors.push(`${it.id}: ${why}。search_web の結果に書かれたものだけを使うか、外してください`);
  if (!evidence || !sourceUrl || !evidence.urls.has(sourceUrl)) return fail("出典（sourceUrl）が、この回の Google 検索の結果の URL ではありません");
  const text = normalizeForMatch(evidence.text);
  // 空や 1 文字の名前は、どの本文にも含まれてしまうので照合に使わない
  const mentioned = (name: string) => normalizeForMatch(name).length >= 2 && text.includes(normalizeForMatch(name));
  if (it.provider?.sourceUrl) {
    if (it.provider.slotId) fail("予約枠（slotId）は検索では分かりません");
    if (!mentioned(it.provider.name)) fail(`「${it.provider.name}」は検索結果に書かれていません`);
    if (it.provider.priceJpy !== undefined && !textMentionsPrice(evidence.text, it.provider.priceJpy)) fail(`価格 ${it.provider.priceJpy} 円は検索結果に書かれていません`);
  }
  if (it.route?.source === "web") {
    for (const leg of it.route.legs) {
      if (!mentioned(leg.line)) fail(`便「${leg.line}」は検索結果に書かれていません`);
    }
    if (it.route.fareJpy !== undefined && !textMentionsPrice(evidence.text, it.route.fareJpy)) fail(`運賃 ${it.route.fareJpy} 円は検索結果に書かれていません`);
  }
}

/** 差し戻しの文で使う「ID（タイトル・時刻）」。ID だけだと AI がどれを直すか取り違えるため */
function label(it: TimelineItem): string {
  return `${it.id}（${it.title}・${formatJst(it.start)}〜${formatJst(it.end, { time: true })}）`;
}

/**
 * エージェントが提出したタイムラインを検証する（自己修正ループの判定器）。
 * errors があれば submit_timeline は差し戻され、Gemini が自律的に組み直す。
 */
export function validateTimeline(
  items: readonly TimelineItem[],
  event: OshiEvent,
  busy: readonly BusyBlock[],
  now = Date.now(),
  forecast?: { sky: string; needsRainGear: boolean },
  webEvidence?: WebEvidence,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eventStart = Date.parse(event.startAt);

  const sorted = [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const it of sorted) {
    const s = Date.parse(it.start);
    const e = Date.parse(it.end);
    if (!(e > s)) errors.push(`${it.id}: 終了時刻が開始時刻より前です`);
    if (s < now - 5 * MS_MIN) errors.push(`${it.id}: 過去の日時は指定できません`);

    checkWebSourced(it, webEvidence, errors);

    if (it.kind === "beauty") {
      // 検索で見つけた店舗（sourceUrl あり）は上の checkWebSourced で確かめる。それ以外は店舗名・価格を書かせない
      if (it.provider && !it.provider.sourceUrl && (it.provider.name !== "予約サイトで店舗と空きを確認" || it.provider.priceJpy !== undefined || it.provider.slotId)) {
        errors.push(`${it.id}: 実際の店舗・空席・価格は取得していません。候補日時として案内してください`);
      }
      if (e > eventStart) errors.push(`${it.id}: 美容予定はイベント開始前に終わる必要があります`);
      if (overlapsBusy(busy, s, e, 15)) errors.push(`${it.id}: カレンダーの既存予定（前後15分の移動バッファ含む）と重なっています`);
      if (isBeautyService(it.category)) {
        const [minD, maxD] = BEAUTY_GUIDELINES[it.category].idealDaysBefore;
        const d = jstDayDiff(event.startAt, it.start);
        if (d < minD || d > maxD) warnings.push(`${it.title} は推奨（${minD}〜${maxD}日前）から外れています（${d}日前）`);
      }
    }

    // 宿の価格は、Google 検索で見つけた宿（出典あり）のときだけ書ける
    if (it.kind === "stay" && !it.provider?.sourceUrl && (it.provider?.priceJpy !== undefined || it.provider?.slotId)) {
      errors.push(`${it.id}: 宿の価格・空室は取得していません。search_web で見つけた宿（出典つき）でなければ、価格を書かないでください`);
    }

    if (it.kind === "spot") {
      // 立ち寄りは公演の妨げにならないこと。遅れると入場に影響するのでエラー扱い
      if (s < eventStart && (eventStart - e) / MS_MIN < 60) {
        errors.push(`${it.id}: 立ち寄りが開演 60 分前より後まで続いています。開演前は余裕を持たせてください`);
      }
      if (overlapsBusy(busy, s, e, 15)) {
        errors.push(`${it.id}: カレンダーの既存予定と重なっています`);
      }
      if (it.provider?.priceJpy !== undefined || it.provider?.slotId || it.provider?.sourceUrl) {
        errors.push(`${it.id}: 立ち寄り先の価格・予約枠は取得していません。案内だけにしてください`);
      }
      if (forecast?.needsRainGear && it.category === "photo") {
        warnings.push(`${it.title} は雨・雪の予報です。屋内の候補に変えるか、濡れない経路を案内してください`);
      }
    }

    if (it.kind === "transit" && overlapsBusy(busy, s, e)) {
      warnings.push(`${it.title} がカレンダーの既存予定と重なっています。休暇などの調整が必要です`);
    }
    // 所要時間の目安で組んだ移動に、具体的な列車・運賃を書かない（目安は列車を調べていない）
    if (it.kind === "transit" && (it.route?.source === "estimate" || it.route?.source === "mock") && (it.route.legs.length > 0 || it.route.fareJpy !== undefined)) {
      errors.push(`${it.id}: 所要時間の目安で組んだ移動に、列車（legs）や運賃（fareJpy）を書かないでください。目安の要約だけにしてください`);
    }
    // 往路（開演前に出発する移動）は開演 45 分前までに到着していること
    if (it.kind === "transit" && s < eventStart && (eventStart - e) / MS_MIN < 45) {
      errors.push(`${it.id}: 会場到着が開演 45 分前より遅いです（入場・混雑リスク）`);
    }
  }

  // 時間を使う予定どうしの重なり。準備（prep）は確認・持ち物などの覚え書きで、時間を占有しないため対象外
  const blocking = sorted.filter((it) => it.kind !== "event" && it.kind !== "stay" && it.kind !== "prep");
  for (let i = 1; i < blocking.length; i++) {
    const prev = blocking[i - 1];
    const cur = blocking[i];
    if (Date.parse(cur.start) < Date.parse(prev.end)) {
      errors.push(`${label(prev)} と ${label(cur)} の時間が重なっています。どちらかを重ならない時間に移すか、外してください`);
    }
  }

  const requested = new Set(event.beautyServices);
  for (const svc of requested) {
    if (!sorted.some((it) => it.kind === "beauty" && it.category === svc)) {
      warnings.push(`希望メニュー「${BEAUTY_GUIDELINES[svc].label}」がプランに含まれていません`);
    }
  }
  if (!sorted.some((it) => it.kind === "transit" || (it.kind === "prep" && it.category === "transit-check"))) {
    errors.push("移動経路、または経路を確認する手順が含まれていません");
  }

  // 雨・雪の予報を調べたのにプランへ反映していない場合は作り直させる。
  // ヘアセットは濡れると崩れるため、当日の屋外移動とセットで考える必要がある。
  if (forecast?.needsRainGear) {
    const mentionsRain = sorted.some(
      (it) => /雨|雪|傘|濡れ|レイン/.test(it.title) || /雨|雪|傘|濡れ|レイン/.test(it.rationale ?? ""),
    );
    if (!mentionsRain) {
      errors.push("公演日は雨・雪の予報です。持ち物や当日の動き方に、濡れ対策の項目か説明を入れてください");
    }
  }

  return { errors, warnings };
}

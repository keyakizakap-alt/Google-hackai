import { createHash } from "node:crypto";
import { redactText } from "../privacy/mask";
import { toJstIso } from "../time";
import { matchVenue } from "./venues";

/** 検出に使うカレンダー予定（メモリ上のみ・候補以外は即破棄） */
export interface CalendarItemForDetection {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface LiveCandidate {
  key: string; // 元の予定 ID のハッシュ（重複登録防止用）
  summary: string;
  location: string;
  startAt: string;
  timeUnknown: boolean;
}

export interface DetectedLiveEvent {
  key: string;
  artist: string;
  title: string;
  venue: string;
  venueStation: string;
  startAt: string;
  timeUnknown: boolean;
  confidence: "high" | "medium";
  source: "gemini" | "rules";
}

/** ライブ・公演らしさのキーワード */
const LIVE_KEYWORDS =
  /(ライブ|ﾗｲﾌﾞ|live|公演|コンサート|concert|tour|ツアー|ドーム|アリーナ|arena|dome|武道館|ホール公演|ファンミ|fanmeeting|fan ?meeting|fan ?con|showcase|ショーケース|参戦|遠征|フェス|fes|握手会|リリイベ)/i;

/** 明らかに無関係な予定（誤検出防止） */
const EXCLUDE = /(病院|歯医者|会議|打ち合わせ|mtg|面談|締切|支払|誕生日|美容院|サロン|ネイル)/i;

export function isLiveCandidate(item: CalendarItemForDetection): boolean {
  if (item.status === "cancelled") return false;
  const text = `${item.summary ?? ""} ${item.location ?? ""}`;
  if (!item.summary) return false;
  if (EXCLUDE.test(item.summary)) return false;
  return LIVE_KEYWORDS.test(text) || matchVenue(text) !== null;
}

/**
 * ライブ候補だけを抽出する。候補外の予定は戻り値に含めない（＝以降どこにも渡らない）。
 * 候補のテキストも連絡先・URL 等をマスクしてから扱う。
 */
export function pickLiveCandidates(items: readonly CalendarItemForDetection[], now = Date.now()): LiveCandidate[] {
  const out: LiveCandidate[] = [];
  for (const it of items) {
    if (!isLiveCandidate(it)) continue;
    const timed = it.start?.dateTime;
    const startRaw = timed ?? (it.start?.date ? `${it.start.date}T18:00:00+09:00` : undefined);
    const start = startRaw ? Date.parse(startRaw) : NaN;
    if (!Number.isFinite(start) || start < now) continue;
    out.push({
      key: createHash("sha256").update(`oshiready:${it.id ?? it.summary}:${startRaw}`).digest("base64url").slice(0, 12),
      summary: redactText(it.summary ?? "", 120),
      location: redactText(it.location ?? "", 120),
      startAt: toJstIso(start),
      timeUnknown: !timed,
    });
  }
  return out.slice(0, 20);
}

const ARTIST_STOP =
  /\s*(?:the\s+\d+(?:st|nd|rd|th)\s+|world\s+tour|tour|live|ライブ|コンサート|concert|公演|ファンミ|fan\s?meeting|fan\s?con|showcase|ショーケース|in\s|@|＠|「|『|【|\[|’|'|"|“|京セラ|東京ドーム|ドーム|アリーナ|武道館|dome|arena|stadium|hall|\d{4})/i;

/** ルールベースの抽出（Gemini 未設定・障害時のフォールバック） */
export function extractByRules(c: LiveCandidate): DetectedLiveEvent {
  const title = c.summary.replace(/^[【［\[](?:参戦|遠征|当選|ライブ|LIVE)[】］\]]\s*/i, "").trim();
  const venue = matchVenue(`${c.location} ${title}`);
  const locationName = c.location.split(/[,，、\n]/)[0]?.trim() ?? "";
  const idx = title.search(ARTIST_STOP);
  const artist = (idx > 0 ? title.slice(0, idx) : title.split(/\s+/)[0]).trim().replace(/[\s:：\-–—]+$/, "");
  return {
    key: c.key,
    artist: artist || title.slice(0, 20),
    title: title.slice(0, 80),
    venue: venue?.name ?? (locationName || "会場未設定"),
    venueStation: venue?.station ?? (locationName || "会場最寄り駅"),
    startAt: c.startAt,
    timeUnknown: c.timeUnknown,
    confidence: venue ? "high" : "medium",
    source: "rules",
  };
}

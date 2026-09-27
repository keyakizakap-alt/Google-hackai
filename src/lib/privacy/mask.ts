import { toJstIso } from "../time";

/**
 * Google Calendar の生イベント（メモリ上のみで扱う）。
 * 取得時に fields パラメータで start/end/transparency/status/eventType だけに絞っているため
 * 通常 summary などは含まれないが、万一含まれても下の maskEvents で必ず破棄する（多層防御）。
 */
export interface RawCalendarEvent {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  transparency?: string;
  eventType?: string;
  summary?: string;
  description?: string;
  location?: string;
  attendees?: unknown[];
  [k: string]: unknown;
}

/** マスキング後の「埋まっている時間帯」。予定の中身は一切持たない */
export interface BusyBlock {
  start: string; // JST ISO
  end: string; // JST ISO
  allDay: boolean;
  label: "予定あり";
}

const IGNORED_EVENT_TYPES = new Set(["birthday", "workingLocation", "fromGmail"]);

function allDayToIso(date: string): string {
  return `${date}T00:00:00+09:00`;
}

/**
 * 生イベント → BusyBlock。タイトル・説明・場所・参加者はここで捨てる。
 * 戻り値のオブジェクトは新規生成するため、元オブジェクトへの参照も残らない。
 */
export function maskEvents(raw: readonly RawCalendarEvent[]): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const ev of raw) {
    if (ev.status === "cancelled") continue;
    if (ev.transparency === "transparent") continue; // 「空き時間」として登録された予定
    if (ev.eventType && IGNORED_EVENT_TYPES.has(ev.eventType)) continue;

    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
    const startRaw = ev.start?.dateTime ?? (ev.start?.date ? allDayToIso(ev.start.date) : undefined);
    const endRaw = ev.end?.dateTime ?? (ev.end?.date ? allDayToIso(ev.end.date) : undefined);
    if (!startRaw || !endRaw) continue;

    const s = Date.parse(startRaw);
    const e = Date.parse(endRaw);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;

    out.push({ start: toJstIso(s), end: toJstIso(e), allDay, label: "予定あり" });
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[メール]"],
  [/https?:\/\/\S+/g, "[URL]"],
  [/\+?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}[-\s]?\d{3,4}/g, "[電話番号]"],
  [/〒?\d{3}-\d{4}/g, "[郵便番号]"],
  [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[カード番号]"],
];

/**
 * 自由入力（修正指示など）を LLM に渡す前に、連絡先・カード番号等をマスクする。
 * 推し活プランの修正に不要な個人情報をモデルへ送らないためのデータ最小化。
 */
export function redactText(input: string, maxLength = 500): string {
  let s = input.slice(0, maxLength);
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  return s;
}

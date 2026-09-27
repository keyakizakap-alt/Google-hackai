/**
 * JST（Asia/Tokyo, UTC+9, DST なし）の日時ユーティリティ。
 * Cloud Run は UTC で動くため、サーバー側でも常に +09:00 を明示して扱う。
 */
export const JST_OFFSET_MIN = 9 * 60;
export const MS_MIN = 60_000;
export const MS_HOUR = 60 * MS_MIN;
export const MS_DAY = 24 * MS_HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "2026-10-30T18:00:00+09:00" */
export function toJstIso(d: Date | number): string {
  const t = new Date(typeof d === "number" ? d : d.getTime());
  const j = new Date(t.getTime() + JST_OFFSET_MIN * MS_MIN);
  return (
    `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}` +
    `T${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}:00+09:00`
  );
}

/** Date → "2026-10-30"（JST の暦日） */
export function jstDateKey(d: Date | number): string {
  return toJstIso(d).slice(0, 10);
}

/** "2026-10-30" + 時刻 → epoch ms（JST） */
export function jstAt(dateKey: string, hour: number, minute = 0): number {
  return Date.parse(`${dateKey}T${pad(hour)}:${pad(minute)}:00+09:00`);
}

/** JST の暦日同士の差（a - b）を日数で返す */
export function jstDayDiff(a: Date | number | string, b: Date | number | string): number {
  const ka = jstDateKey(new Date(a));
  const kb = jstDateKey(new Date(b));
  return Math.round((Date.parse(`${ka}T00:00:00Z`) - Date.parse(`${kb}T00:00:00Z`)) / MS_DAY);
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function formatJst(iso: string, opts: { date?: boolean; time?: boolean } = { date: true, time: true }) {
  const d = new Date(iso);
  const j = new Date(d.getTime() + JST_OFFSET_MIN * MS_MIN);
  const date = `${j.getUTCMonth() + 1}/${j.getUTCDate()} (${WEEK[j.getUTCDay()]})`;
  const time = `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
  if (opts.date && opts.time) return `${date} ${time}`;
  return opts.date ? date : time;
}

/** イベント当日を 0 とした相対ラベル（"3日前" / "当日" / "翌日"） */
export function relativeDayLabel(iso: string, eventIso: string): string {
  const diff = jstDayDiff(eventIso, iso);
  if (diff === 0) return "当日";
  if (diff > 0) return `${diff}日前`;
  return `${-diff}日後`;
}

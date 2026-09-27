import type { BusyBlock } from "./privacy/mask";
import { jstAt, jstDateKey, MS_DAY, MS_MIN, toJstIso } from "./time";

export interface FreeSlot {
  date: string; // YYYY-MM-DD (JST)
  start: string; // JST ISO
  end: string; // JST ISO
  minutes: number;
}

export interface AvailabilityOptions {
  from: number; // epoch ms
  to: number; // epoch ms
  /** 1 日の中で活動可能とみなす時間帯（JST） */
  dayStartHour?: number;
  dayEndHour?: number;
  /** この長さ未満の空きは捨てる */
  minMinutes?: number;
  /** 既存予定の前後に確保する移動・準備バッファ */
  bufferMinutes?: number;
}

type Interval = [number, number];

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push([cur[0], cur[1]]);
  }
  return out;
}

/**
 * Busy ブロックから「移動・美容サロンに行ける空き時間」を抽出する。
 * 入出力ともに時間帯のみで、予定の内容は扱わない。
 */
export function extractFreeSlots(busy: readonly BusyBlock[], opts: AvailabilityOptions): FreeSlot[] {
  const { from, to, dayStartHour = 9, dayEndHour = 21, minMinutes = 60, bufferMinutes = 30 } = opts;
  const buffer = bufferMinutes * MS_MIN;
  const blocked = mergeIntervals(
    busy.map((b) => [Date.parse(b.start) - buffer, Date.parse(b.end) + buffer] as Interval),
  );

  const slots: FreeSlot[] = [];
  for (let day = Date.parse(`${jstDateKey(from)}T00:00:00+09:00`); day < to; day += MS_DAY) {
    const key = jstDateKey(day);
    let cursor = Math.max(jstAt(key, dayStartHour), from);
    const dayEnd = Math.min(jstAt(key, dayEndHour), to);
    if (cursor >= dayEnd) continue;

    for (const [bs, be] of blocked) {
      if (be <= cursor || bs >= dayEnd) continue;
      if (bs > cursor) pushSlot(slots, key, cursor, Math.min(bs, dayEnd), minMinutes);
      cursor = Math.max(cursor, be);
      if (cursor >= dayEnd) break;
    }
    if (cursor < dayEnd) pushSlot(slots, key, cursor, dayEnd, minMinutes);
  }
  return slots;
}

function pushSlot(slots: FreeSlot[], date: string, s: number, e: number, minMinutes: number) {
  // 15 分単位に丸めて提案しやすくする
  const q = 15 * MS_MIN;
  const start = Math.ceil(s / q) * q;
  const end = Math.floor(e / q) * q;
  const minutes = Math.round((end - start) / MS_MIN);
  if (minutes >= minMinutes) slots.push({ date, start: toJstIso(start), end: toJstIso(end), minutes });
}

/** 指定区間が Busy と重なるか（バッファ込み） */
export function overlapsBusy(busy: readonly BusyBlock[], start: number, end: number, bufferMinutes = 0): boolean {
  const buffer = bufferMinutes * MS_MIN;
  return busy.some((b) => start < Date.parse(b.end) + buffer && end > Date.parse(b.start) - buffer);
}

export interface DaySummary {
  date: string;
  busyMinutes: number;
  freeMinutes: number;
}

/** ミニカレンダー表示用の日別サマリー（時間量のみ） */
export function summarizeByDay(busy: readonly BusyBlock[], free: readonly FreeSlot[], from: number, to: number): DaySummary[] {
  const days: DaySummary[] = [];
  for (let day = Date.parse(`${jstDateKey(from)}T00:00:00+09:00`); day < to; day += MS_DAY) {
    const key = jstDateKey(day);
    const dayStart = day;
    const dayEnd = day + MS_DAY;
    const busyMinutes = busy.reduce((acc, b) => {
      const s = Math.max(Date.parse(b.start), dayStart);
      const e = Math.min(Date.parse(b.end), dayEnd);
      return acc + Math.max(0, (e - s) / MS_MIN);
    }, 0);
    const freeMinutes = free.filter((f) => f.date === key).reduce((a, f) => a + f.minutes, 0);
    days.push({ date: key, busyMinutes: Math.round(busyMinutes), freeMinutes });
  }
  return days;
}

import type { BusyBlock } from "../privacy/mask";

/**
 * プランの項目と「埋まっている時間帯」の重なりを調べる。
 * 項目とまったく同じ時間帯の予定は、プランをカレンダーに追加したもの（.ics など）とみなして重なりに数えない。
 */
export function findConflicts(items: { id: string; start: string; end: string }[], busy: BusyBlock[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const s = Date.parse(it.start);
    const e = Date.parse(it.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    const hit = busy.some((b) => {
      const bs = Date.parse(b.start);
      const be = Date.parse(b.end);
      if (b.allDay) return false; // 終日の予定（祝日・メモ等）は時間の重なりとして扱わない
      if (Math.abs(bs - s) < 60_000 && Math.abs(be - e) < 60_000) return false; // プラン自身
      return bs < e && be > s;
    });
    if (hit) out.push(it.id);
  }
  return out;
}

/**
 * ライブ本体の予定（カレンダーから取り込んだイベント自身）を「埋まり」から外す。
 * 開演の 3 時間前〜1 時間後に始まり、開演後 6 時間以内に終わる予定を、公演そのものとみなす。
 */
export function withoutEventBlock(busy: readonly BusyBlock[], eventStartIso: string): BusyBlock[] {
  const evStart = Date.parse(eventStartIso);
  return busy.filter((b) => {
    const s = Date.parse(b.start);
    const e = Date.parse(b.end);
    return !(!b.allDay && s >= evStart - 3 * 3_600_000 && s <= evStart + 3_600_000 && e >= evStart && e <= evStart + 6 * 3_600_000);
  });
}

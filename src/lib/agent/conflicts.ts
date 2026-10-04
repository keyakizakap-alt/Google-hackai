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

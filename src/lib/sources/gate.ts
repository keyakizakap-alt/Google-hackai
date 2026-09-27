import { pickLiveCandidates, type CalendarItemForDetection, type LiveCandidate } from "../eventDetection/detect";
import type { BusyBlock } from "../privacy/mask";
import { toJstIso } from "../time";

/**
 * すべての連携先が通る「共通の安全チェック」。
 * 連携先の部品が増えても、ここを通らずにアプリへ予定データが届くことはない。
 *
 * - 空き時間: 時間帯（開始・終了・終日かどうか）以外の項目を捨てて作り直す
 * - ライブ検出: ライブ候補だけを残し、それ以外の予定は即座に破棄。候補も連絡先等を伏せる
 */
export function sanitizeBusy(blocks: readonly BusyBlock[]): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const b of blocks) {
    const s = Date.parse(b?.start);
    const e = Date.parse(b?.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    out.push({ start: toJstIso(s), end: toJstIso(e), allDay: Boolean(b.allDay), label: "予定あり" });
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function gateForDetection(items: CalendarItemForDetection[], now = Date.now()): { scanned: number; candidates: LiveCandidate[] } {
  const scanned = items.length;
  const candidates = pickLiveCandidates(items, now);
  items.length = 0; // 候補以外の予定への参照をここで断つ
  return { scanned, candidates };
}

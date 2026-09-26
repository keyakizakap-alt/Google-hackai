import type { BusyBlock } from "../privacy/mask";
import { jstAt, jstDateKey, MS_DAY, toJstIso } from "../time";

/**
 * Google 連携前でも体験できるデモ用の「予定あり」ブロック。
 * 平日 9:30-18:30 の勤務と、いくつかの夜の予定を決定的に生成する。
 * dayOff に指定した日（イベント当日＝有休取得済みの想定）は予定なしにする。
 */
export function demoBusyBlocks(from: number, to: number, dayOff?: string): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  let i = 0;
  for (let day = Date.parse(`${jstDateKey(from)}T00:00:00+09:00`); day < to; day += MS_DAY, i++) {
    const key = jstDateKey(day);
    if (key === dayOff) continue;
    const dow = new Date(jstAt(key, 12)).getUTCDay();
    const push = (sh: number, sm: number, eh: number, em: number) =>
      blocks.push({ start: toJstIso(jstAt(key, sh, sm)), end: toJstIso(jstAt(key, eh, em)), allDay: false, label: "予定あり" });

    if (dow >= 1 && dow <= 5) {
      push(9, 30, 18, 30); // 勤務
      if (i % 4 === 1) push(19, 30, 21, 30); // 夜の予定
    } else if (i % 2 === 0) {
      push(13, 0, 16, 0); // 週末の予定
    }
  }
  return blocks;
}

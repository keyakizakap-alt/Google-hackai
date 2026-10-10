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

/**
 * デモ用の「予定（タイトルあり）」。ライブ検出のデモに使う。
 * ライブ以外の予定も混ぜ、検出側で除外されることを示す。
 */
export function demoCalendarItems(now: number) {
  const at = (days: number, hour: number, fixed?: string) => {
    const iso = fixed && Date.parse(fixed) > now + 5 * MS_DAY ? fixed : toJstIso(jstAt(jstDateKey(now + days * MS_DAY), hour));
    return { dateTime: iso };
  };
  const plus = (s: { dateTime: string }, h: number) => ({ dateTime: toJstIso(Date.parse(s.dateTime) + h * 3_600_000) });
  const lumirise = at(34, 18, "2026-10-30T18:00:00+09:00");
  const solaFlare = at(52, 17);
  const astronova = at(80, 18);
  return [
    { id: "demo-1", summary: "LUMIRISE 京セラドーム公演", location: "京セラドーム大阪", start: lumirise, end: plus(lumirise, 3) },
    { id: "demo-2", summary: "【参戦】SOLA FLARE FAN MEETING", location: "横浜アリーナ", start: solaFlare, end: plus(solaFlare, 3) },
    { id: "demo-3", summary: "ASTRONOVA TOUR 東京ドーム", location: "", start: astronova, end: plus(astronova, 3) },
    { id: "demo-4", summary: "歯医者", location: "", start: at(3, 10), end: at(3, 11) },
    { id: "demo-5", summary: "定例会議", location: "", start: at(5, 14), end: at(5, 15) },
    { id: "demo-6", summary: "友達とランチ", location: "", start: at(9, 12), end: at(9, 14) },
  ];
}

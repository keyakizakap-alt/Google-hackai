import type { BusyBlock } from "../privacy/mask";
import { formatJst, jstDateKey } from "../time";
import { findConflicts } from "./conflicts";
import type { Plan } from "./types";

/**
 * 見張り: 承認したあとのプランが、その後の変化で困ったことにならないかを調べる。
 *
 * ここでは「何が起きたか」を判定するだけで、AI は呼ばない（費用がかからないので何度でも確かめられる）。
 * 見直しが必要なときだけエージェントに見直し案を作らせ、その案も必ず承認待ちで止める。
 */
export type WatchSignal =
  | { kind: "conflict"; itemIds: string[]; titles: string[] }
  | { kind: "rain"; date: string; text: string; sky: "rain" | "snow" };

const RAIN_WORDS = /雨|雪|傘|濡れ|レイン/;

export function detectSignals(params: {
  plan: Plan;
  busy: readonly BusyBlock[] | null;
  forecast?: { date: string; sky: string; text: string; needsRainGear: boolean };
  now?: number;
}): WatchSignal[] {
  const { plan, busy, forecast, now = Date.now() } = params;
  const signals: WatchSignal[] = [];
  const upcoming = plan.items.filter((i) => i.kind !== "event" && Date.parse(i.start) > now);

  // 1) カレンダーに後から入った予定との重なり（カレンダー未連携なら調べない）
  if (busy && upcoming.length) {
    const ids = findConflicts(upcoming, [...busy]);
    if (ids.length) {
      const byId = new Map(upcoming.map((i) => [i.id, i]));
      signals.push({ kind: "conflict", itemIds: ids, titles: ids.map((id) => `${byId.get(id)!.title}（${formatJst(byId.get(id)!.start)}）`) });
    }
  }

  // 2) 公演日が雨・雪の予報になったのに、プランが濡れ対策に触れていない
  if (forecast?.needsRainGear && forecast.date === jstDateKey(Date.parse(plan.event.startAt)) && Date.parse(plan.event.startAt) > now) {
    const text = [plan.summary, ...plan.warnings, ...plan.items.flatMap((i) => [i.title, i.rationale])].join("\n");
    if (!RAIN_WORDS.test(text)) signals.push({ kind: "rain", date: forecast.date, text: forecast.text, sky: forecast.sky === "snow" ? "snow" : "rain" });
  }
  return signals;
}

/** 同じ変化に対して何度も見直し案を作らないための目印 */
export function signalKey(plan: Plan, signals: readonly WatchSignal[]): string {
  const parts = signals.map((s) => (s.kind === "conflict" ? `c:${[...s.itemIds].sort().join(",")}` : `w:${s.date}:${s.sky}`));
  return `${plan.id}:${plan.revision}:${parts.sort().join("|")}`;
}

/** 見直しを頼むときの指示文（サーバーで組み立てる。利用者の入力は混ざらない） */
export function reviewInstruction(signals: readonly WatchSignal[], keepTitles: readonly string[]): string {
  const lines = ["【見張りからの自動の見直し】承認後に次の変化がありました。変化に合わせて、必要なところだけ組み直してください。"];
  for (const s of signals) {
    if (s.kind === "conflict") lines.push(`- カレンダーに新しい予定が入り、次の項目と時間が重なりました：${s.titles.join("、")}。重ならない時間に移してください。`);
    else lines.push(`- 公演日（${s.date.slice(5).replace("-", "/")}）が「${s.text || (s.sky === "snow" ? "雪" : "雨")}」の予報になりました。ヘアセットの時間・持ち物・屋外での待ち時間に濡れ対策を反映してください。`);
  }
  if (keepTitles.length) lines.push(`- 承認済みの次の項目は、重なりの解消に必要な場合を除き時間を変えないでください：${keepTitles.join("、")}`);
  return lines.join("\n");
}

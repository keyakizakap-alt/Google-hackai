import { describe, expect, it } from "vitest";
import { executeTool, type AgentContext } from "@/lib/agent/tools";
import { validateTimeline } from "@/lib/agent/validate";
import type { OshiEvent, TimelineItem } from "@/lib/agent/types";
import { MS_DAY } from "@/lib/time";

/**
 * AI が同じ指摘で何度も差し戻され、プランを仕上げられない問題の確認。
 * 「作り直します」が 9 回続き、最後は「AI がプランを仕上げられませんでした」になっていた。
 */
const day = new Date(Date.now() + 20 * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
const prevDay = new Date(Date.now() + 19 * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
const at = (d: string, hm: string) => `${d}T${hm}:00+09:00`;
const event: OshiEvent = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: at(day, "18:00"), homeStation: "長崎", beautyServices: [], arriveEarlyForGoods: true,
};
const live: TimelineItem = { id: "live", kind: "event", title: "LUMIRISE 公演", start: at(day, "18:00"), end: at(day, "21:00"), rationale: "r", requiresBooking: false };
const check: TimelineItem = { id: "check", kind: "prep", category: "transit-check", title: "経路を確認", start: at(prevDay, "21:00"), end: at(prevDay, "21:15"), rationale: "r", requiresBooking: false };
const ctxOf = (): AgentContext => ({ event, busy: [], now: Date.now(), rejectedSubmissions: 0 });

describe("予定の重なりの検査", () => {
  it("準備（確認・持ち物などの覚え書き）は、ほかの予定と重なっても差し戻さない", () => {
    const spot: TimelineItem = { id: "spot", kind: "spot", category: "food", title: "たこ焼き", start: at(day, "13:00"), end: at(day, "14:00"), rationale: "営業時間は事前に確認", requiresBooking: false };
    const memo: TimelineItem = { id: "memo", kind: "prep", title: "チケットを確認", start: at(day, "13:30"), end: at(day, "13:45"), rationale: "r", requiresBooking: false };
    expect(validateTimeline([live, check, spot, memo], event, [], Date.now()).errors).toEqual([]);
  });

  it("時間を使う予定どうしの重なりは、タイトルと時刻を入れて差し戻す", () => {
    const a: TimelineItem = { id: "spot-a", kind: "spot", category: "food", title: "たこ焼き", start: at(day, "12:00"), end: at(day, "13:00"), rationale: "営業時間は事前に確認", requiresBooking: false };
    const b: TimelineItem = { id: "spot-b", kind: "spot", category: "photo", title: "記念撮影", start: at(day, "12:30"), end: at(day, "13:30"), rationale: "営業時間は事前に確認", requiresBooking: false };
    const { errors } = validateTimeline([live, check, a, b], event, [], Date.now());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("spot-a（たこ焼き・");
    expect(errors[0]).toContain("spot-b（記念撮影・");
  });
});

describe("同じ指摘が続いたときの仕上げ", () => {
  const late: TimelineItem = { id: "spot-late", kind: "spot", category: "food", title: "たこ焼き", start: at(day, "16:30"), end: at(day, "17:30"), rationale: "営業時間は事前に確認", requiresBooking: false };
  const submit = (ctx: AgentContext, items: TimelineItem[]) => executeTool("submit_timeline", { summary: "提案です", items }, ctx);

  it("1 回目は理由を表示して差し戻し、同じ指摘の 2 回目は問題の項目を外して仕上げる", async () => {
    const ctx = ctxOf();
    const first = await submit(ctx, [live, check, late]);
    expect(first.ok).toBe(false);
    expect(first.summary).toContain("立ち寄りが開演 60 分前より後まで続いています");
    expect(first.summary).not.toContain("spot-late");

    const second = await submit(ctx, [live, check, late]);
    expect(second.ok).toBe(true);
    expect(ctx.submitted?.items.map((i) => i.id)).toEqual(["live", "check"]);
    expect(ctx.submitted?.warnings.join(" ")).toContain("「たこ焼き」は時間が合わなかったため外しました");
    expect(ctx.rejectedSubmissions).toBe(1);
  });

  it("移動の確認が足りないという指摘が続いたら、確認の項目を足して仕上げる", async () => {
    const ctx = ctxOf();
    expect((await submit(ctx, [live])).ok).toBe(false);
    expect((await submit(ctx, [live])).ok).toBe(true);
    expect(ctx.submitted?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transit-check-auto", category: "transit-check" })]));
  });

  it("指摘が変わったら、もう一度 AI に直してもらう（すぐには仕上げない）", async () => {
    const ctx = ctxOf();
    expect((await submit(ctx, [live, check, late])).ok).toBe(false);
    expect((await submit(ctx, [live])).ok).toBe(false);
    expect(ctx.submitted).toBeUndefined();
  });

  it("形式の誤りを挟んだら、同じ指摘が続いたとは数えない", async () => {
    const ctx = ctxOf();
    expect((await submit(ctx, [live, check, late])).ok).toBe(false);
    expect((await executeTool("submit_timeline", { summary: "提案です", items: "壊れた形式" }, ctx)).ok).toBe(false);
    expect((await submit(ctx, [live, check, late])).ok).toBe(false);
    expect(ctx.submitted).toBeUndefined();
  });

  it("駅すぱあとで調べていない経路があるときは、項目を外しても仕上げない", async () => {
    const ctx = ctxOf();
    const fakeRoute: TimelineItem = {
      id: "go", kind: "transit", title: "会場へ移動", start: at(day, "12:00"), end: at(day, "15:00"),
      route: { from: "長崎", to: "ドーム前千代崎", summary: "新幹線", legs: [], source: "ekispert" }, rationale: "r", requiresBooking: true,
    };
    expect((await submit(ctx, [live, fakeRoute, late])).ok).toBe(false);
    expect((await submit(ctx, [live, fakeRoute, late])).ok).toBe(false);
    expect(ctx.submitted).toBeUndefined();
  });

  it("外した項目は、要約と「選んだ理由」からも外す", async () => {
    const ctx = ctxOf();
    const args = {
      summary: "たこ焼きに立ち寄るプランです",
      items: [live, check, late],
      decisions: [
        { topic: "立ち寄り先", chosen: "たこ焼き 16:30", alternatives: [], reason: "r" },
        { topic: "現地に着く時刻", chosen: "15:00 ごろ", alternatives: [], reason: "r" },
      ],
    };
    await executeTool("submit_timeline", args, ctx);
    expect((await executeTool("submit_timeline", args, ctx)).ok).toBe(true);
    expect(ctx.submitted?.decisions.map((d) => d.topic)).toEqual(["現地に着く時刻"]);
    expect(ctx.submitted?.summary).toContain("時間が合わなかった「たこ焼き」は外しました");
  });

  it("ID は完全に一致するものだけを外す（1 が spot-1 に一致しない）", async () => {
    const ctx = ctxOf();
    const a: TimelineItem = { id: "spot-1", kind: "spot", category: "food", title: "たこ焼き", start: at(day, "12:00"), end: at(day, "13:00"), rationale: "営業時間は事前に確認", requiresBooking: false };
    const b: TimelineItem = { id: "spot-2", kind: "spot", category: "photo", title: "記念撮影", start: at(day, "12:30"), end: at(day, "13:30"), rationale: "営業時間は事前に確認", requiresBooking: false };
    const other: TimelineItem = { id: "1", kind: "spot", category: "food", title: "お好み焼き", start: at(prevDay, "12:00"), end: at(prevDay, "13:00"), rationale: "営業時間は事前に確認", requiresBooking: false };
    await submit(ctx, [live, check, a, b, other]);
    expect((await submit(ctx, [live, check, a, b, other])).ok).toBe(true);
    expect(ctx.submitted?.items.map((i) => i.id)).toContain("1");
  });

  it("要約に「予約しました」と書く指摘は、項目を外しても直らないので仕上げない", async () => {
    const ctx = ctxOf();
    const bad = () => executeTool("submit_timeline", { summary: "予約しました", items: [live, check] }, ctx);
    expect((await bad()).ok).toBe(false);
    expect((await bad()).ok).toBe(false);
    expect(ctx.submitted).toBeUndefined();
  });
});

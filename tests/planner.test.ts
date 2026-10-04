import { describe, expect, it } from "vitest";
import { runRuleBasedPlanner } from "@/lib/agent/fallback";
import { executeTool, type AgentContext } from "@/lib/agent/tools";
import { validateTimeline } from "@/lib/agent/validate";
import type { OshiEvent, TraceStep } from "@/lib/agent/types";
import { demoBusyBlocks } from "@/lib/demo/calendar";
import { MS_DAY } from "@/lib/time";

const event: OshiEvent = {
  id: "e1", artist: "IVE", title: "IVE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: new Date(Date.now() + 20 * MS_DAY).toISOString().slice(0, 10) + "T18:00:00+09:00",
  homeStation: "長崎", beautyServices: ["brow", "hair"], arriveEarlyForGoods: true,
};

describe("planning tools + validation", () => {
  it("rule-based planner produces a timeline that passes validation", async () => {
    const now = Date.now();
    const ctx: AgentContext = { event, busy: demoBusyBlocks(now, now + 25 * MS_DAY), now, rejectedSubmissions: 0 };
    const trace: TraceStep[] = [];
    await runRuleBasedPlanner(ctx, trace);
    expect(ctx.submitted).toBeDefined();
    const kinds = ctx.submitted!.items.map((i) => i.kind);
    expect(ctx.submitted!.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "prep", category: "transit-check" })]));
    expect(ctx.submitted!.items.some((i) => i.route?.source === "mock")).toBe(false);
    expect(kinds).toContain("event");
    expect(ctx.submitted!.items.filter((i) => i.kind === "beauty")).toHaveLength(2);
    expect(validateTimeline(ctx.submitted!.items, event, ctx.busy, now).errors).toEqual([]);
  });

  it("rule-based planner records why it chose each time (decisions)", async () => {
    const now = Date.now();
    const ctx: AgentContext = { event, busy: demoBusyBlocks(now, now + 25 * MS_DAY), now, rejectedSubmissions: 0 };
    await runRuleBasedPlanner(ctx, []);
    const topics = ctx.submitted!.decisions.map((d) => d.topic);
    expect(topics).toEqual(expect.arrayContaining(["眉毛サロンの日時", "現地に着く時刻"]));
    for (const d of ctx.submitted!.decisions) {
      expect(d.reason.length).toBeGreaterThan(5);
      expect(d.alternatives.length).toBeGreaterThan(0);
    }
  });

  it("submit_timeline rejects items overlapping calendar busy blocks", async () => {
    const now = Date.now();
    const busy = [{ start: "2099-01-01T00:00:00+09:00", end: "2099-01-01T01:00:00+09:00", allDay: false, label: "予定あり" as const }];
    const day = event.startAt.slice(0, 10);
    busy.push({ start: `${day}T10:00:00+09:00`, end: `${day}T12:00:00+09:00`, allDay: false, label: "予定あり" });
    const ctx: AgentContext = { event, busy, now, rejectedSubmissions: 0 };
    const out = await executeTool("submit_timeline", {
      summary: "x",
      items: [
        { id: "b1", kind: "beauty", category: "brow", title: "眉", start: `${day}T10:30:00+09:00`, end: `${day}T11:30:00+09:00`, rationale: "r", requiresBooking: true },
        { id: "t1", kind: "transit", title: "移動", start: `${day}T13:00:00+09:00`, end: `${day}T17:50:00+09:00`, rationale: "r", requiresBooking: true },
      ],
    }, ctx);
    expect(out.ok).toBe(false);
    const errors = (out.response.errors as string[]).join("\n");
    expect(errors).toMatch(/既存予定/);
    expect(errors).toMatch(/45 分前/);
    expect(ctx.submitted).toBeUndefined();
  });

  it("refuses tools outside the allowlist", async () => {
    const now = Date.now();
    const out = await executeTool("book_salon", {}, { event, busy: [], now, rejectedSubmissions: 0 });
    expect(out.ok).toBe(false);
  });

  it("does not invent a route or accept unverified salon prices", async () => {
    const now = Date.now();
    const ctx: AgentContext = { event, busy: [], now, rejectedSubmissions: 0 };
    const route = await executeTool("search_transit_route_mock", { from_station: "福岡", to_station: "東京" }, ctx);
    expect(route.ok).toBe(false);
    expect(route.response).not.toHaveProperty("legs");

    const day = event.startAt.slice(0, 10);
    const result = validateTimeline([
      { id: "beauty-1", kind: "beauty", category: "brow", title: "眉毛", start: `${day}T10:00:00+09:00`, end: `${day}T11:00:00+09:00`, provider: { name: "架空の店", priceJpy: 5000 }, rationale: "候補", requiresBooking: true },
      { id: "check", kind: "prep", category: "transit-check", title: "経路を確認", start: `${day}T12:00:00+09:00`, end: `${day}T12:10:00+09:00`, rationale: "検索", requiresBooking: false },
    ], event, [], now);
    expect(result.errors.join(" ")).toMatch(/実際の店舗・空席・価格/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * プラン作成の時間切れ（AgentDeadlineError）を防ぐしくみのテスト。
 * - AI が 1 回の応答で頼んだ調べものは、同時に実行する（Google 検索 3 件を順番に待つと 1 分以上かかっていた）
 * - 締め切りが近いときは Google 検索を始めず、提出の時間を残す
 */
const SEARCH_MS = 300;
let searchCalls = 0;

vi.mock("@/lib/services/webSearch", () => ({
  isWebSearchEnabled: () => true,
  searchWeb: vi.fn(async (purpose: string) => {
    searchCalls += 1;
    await new Promise((r) => setTimeout(r, SEARCH_MS));
    return { available: false, reason: `${purpose} は見つかりませんでした` };
  }),
}));

const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const submit = {
  name: "submit_timeline",
  args: { summary: "提案です", items: [{ id: "p1", kind: "prep", category: "transit-check", title: "経路の確認", start: `${day}T09:00:00+09:00`, end: `${day}T09:15:00+09:00`, rationale: "r", requiresBooking: false }] },
};
const searches = ["beauty_salon", "hotel", "flight"].map((purpose) => ({ name: "search_web", args: { purpose, query: `東京 ${purpose}` } }));
let turn = 0;

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => {
        // 1 回目は検索を 3 件まとめて頼み、2 回目で提出する
        const calls = turn++ === 0 ? searches : [submit];
        return {
          functionCalls: calls.map((c, i) => ({ id: `c${i}`, ...c })),
          candidates: [{ content: { role: "model", parts: calls.map((c) => ({ functionCall: c })) } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = "test-key";

const event = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 東京ドーム公演", venue: "東京ドーム", venueStation: "水道橋",
  startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: [] as never[], arriveEarlyForGoods: false,
};

beforeEach(() => {
  searchCalls = 0;
  turn = 0;
});

describe("調べものを同時に実行する", () => {
  it("1 回の応答で頼まれた Google 検索 3 件は、順番に待たずに同時に実行する", async () => {
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const started = Date.now();
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "parallel" });
    expect(searchCalls).toBe(3);
    // 順番に待つと 900ms 以上かかる
    expect(Date.now() - started).toBeLessThan(SEARCH_MS * 2.5);
    expect(out.plan.items.length).toBeGreaterThan(0);
    // 記録は、AI が頼んだ順に並ぶ
    const order = out.trace.filter((t) => t.name === "search_web").map((t) => t.summary);
    expect(order).toEqual(["Google 検索で美容サロンを探しましたが、見つかりませんでした", "Google 検索で宿を探しましたが、見つかりませんでした", "Google 検索で飛行機の便を探しましたが、見つかりませんでした"]);
  });
});

describe("締め切りが近いとき", () => {
  it("Google 検索を始めず、提出の時間を残す", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0, deadline: Date.now() + 30_000 };
    const r = await executeTool("search_web", { purpose: "hotel", query: "東京ドーム 宿" }, ctx);
    expect(searchCalls).toBe(0);
    expect(r.response).toMatchObject({ available: false });
    expect(r.summary).toContain("時間が足りない");
  });

  it("時間に余裕があれば検索する", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0, deadline: Date.now() + 120_000 };
    await executeTool("search_web", { purpose: "hotel", query: "東京ドーム 宿" }, ctx);
    expect(searchCalls).toBe(1);
  });
});

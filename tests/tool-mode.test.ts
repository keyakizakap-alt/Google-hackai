import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 道具の使わせ方（GEMINI_TOOL_MODE）。
 * 「必ず道具を使う」ANY は、Vertex AI の gemini-3.5-flash で 400 INVALID_ARGUMENT になることを本番で確認したため、
 * 既定（AUTO）では指定を送らない。
 */
const seen: { toolConfig?: unknown }[] = [];

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: { config?: { toolConfig?: unknown } }) => {
        seen.push({ toolConfig: req.config?.toolConfig });
        const call = { name: "submit_timeline", args: { summary: "ok", items: [{ id: "t1", kind: "transit", title: "出発", start: `${day}T10:00:00+09:00`, end: `${day}T15:00:00+09:00`, rationale: "r", requiresBooking: true }] } };
        return { functionCalls: [{ id: "c0", ...call }], candidates: [{ content: { role: "model", parts: [{ functionCall: call }] } }] };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = "test-key";

const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const event = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: [] as never[], arriveEarlyForGoods: true,
};

describe("道具の使わせ方", () => {
  beforeEach(() => {
    seen.length = 0;
    vi.resetModules();
    delete process.env.GEMINI_TOOL_MODE;
  });

  it("既定では使わせ方の指定（toolConfig）を送らない", async () => {
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "auto" });
    expect(out.plan.summary).toBe("ok");
    expect(seen[0].toolConfig).toBeUndefined();
  });

  it("GEMINI_TOOL_MODE で VALIDATED や ANY を選べる", async () => {
    process.env.GEMINI_TOOL_MODE = "validated";
    let { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "validated" });
    expect(seen[0].toolConfig).toEqual({ functionCallingConfig: { mode: "VALIDATED" } });

    seen.length = 0;
    vi.resetModules();
    process.env.GEMINI_TOOL_MODE = "ANY";
    ({ runPlanningAgent } = await import("@/lib/agent/orchestrator"));
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "any" });
    expect(seen[0].toolConfig).toEqual({ functionCallingConfig: { mode: "ANY" } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gemini が最初の呼び出しで 400（形が正しくない）を返したとき、
 * 外せる機能を段階的に外して作り直し、プランを作れることを確かめる。
 */
type Req = { config?: { thinkingConfig?: unknown; tools?: { functionDeclarations?: Record<string, unknown>[] }[] } };
const seen: Req[] = [];
let rejectFirst = 0;

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: Req) => {
        seen.push(structuredClone({ config: { thinkingConfig: req.config?.thinkingConfig, tools: req.config?.tools } }));
        if (seen.length <= rejectFirst) {
          throw Object.assign(new Error(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Request contains an invalid argument." } })), { name: "ApiError", status: 400 });
        }
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

describe("互換モード", () => {
  beforeEach(() => {
    seen.length = 0;
    rejectFirst = 0;
  });

  it("400 が続いても、考える深さを外し、引数定義を従来の形式にして作り直せる", async () => {
    rejectFirst = 2;
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "compat" });
    expect(out.plan.summary).toBe("ok");
    expect(seen[0].config?.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(seen[1].config?.thinkingConfig).toBeUndefined();
    const legacy = seen[2].config?.tools?.[0].functionDeclarations ?? [];
    expect(legacy.every((d) => !("parametersJsonSchema" in d))).toBe(true);
    expect(legacy.find((d) => d.name === "submit_timeline")?.parameters).toMatchObject({ type: "OBJECT", required: expect.arrayContaining(["summary", "items"]) });
    expect(out.trace.filter((t) => t.name === "compat_mode")).toHaveLength(2);
  });

  it("3 段階目でも拒否されたら、あきらめてエラーにする（無限に作り直さない）", async () => {
    rejectFirst = 10;
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await expect(runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "give-up" })).rejects.toThrow();
    expect(seen).toHaveLength(3);
  });
});

describe("toOpenApiSchema", () => {
  it("型を大文字にし、使える項目だけを残す", async () => {
    const { toOpenApiSchema } = await import("@/lib/agent/compat");
    expect(
      toOpenApiSchema({ type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 9 }, tags: { type: "array", maxItems: 3, items: { type: "string", enum: ["a"] } } }, required: ["n"], additionalProperties: false }),
    ).toEqual({ type: "OBJECT", properties: { n: { type: "INTEGER", minimum: 1, maximum: 9 }, tags: { type: "ARRAY", maxItems: "3", items: { type: "STRING", enum: ["a"] } } }, required: ["n"] });
  });
});

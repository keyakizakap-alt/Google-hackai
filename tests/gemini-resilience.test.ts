import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gemini が混雑・障害のときの備え（自動の再試行・予備のモデルへの切り替え）のテスト。
 */

const constructed: { httpOptions?: { retryOptions?: { attempts?: number; httpStatusCodes?: number[] } } }[] = [];
const calledModels: string[] = [];
/** モデル名ごとの振る舞い。投げる値を返すと失敗、配列を返すとその関数呼び出しを返す */
let behavior: (model: string) => { throw: unknown } | { calls: { name: string; args: Record<string, unknown> }[] } = () => ({ calls: [] });

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    constructor(opts: (typeof constructed)[number]) {
      constructed.push(opts);
    }
    models = {
      generateContent: vi.fn(async (req: { model: string }) => {
        calledModels.push(req.model);
        const b = behavior(req.model);
        if ("throw" in b) throw b.throw;
        return {
          text: JSON.stringify({ events: [] }),
          functionCalls: b.calls.map((c, i) => ({ id: `c${i}`, ...c })),
          candidates: [{ content: { role: "model", parts: b.calls.map((c) => ({ functionCall: c })) } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "primary-model";
process.env.GEMINI_FALLBACK_MODEL = "backup-model";

const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const event = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: `${day}T18:00:00+09:00`, homeStation: "大阪", beautyServices: [] as never[], arriveEarlyForGoods: false,
};
const submit = {
  name: "submit_timeline",
  args: { summary: "提案です", items: [{ id: "p1", kind: "prep", category: "transit-check", title: "経路の確認", start: `${day}T09:00:00+09:00`, end: `${day}T09:15:00+09:00`, rationale: "r", requiresBooking: false }] },
};
const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { name: "ApiError", status });

beforeEach(() => {
  constructed.length = 0;
  calledModels.length = 0;
});

describe("自動の再試行", () => {
  it("Gemini のクライアントに再試行の設定（429・5xx、最大 3 回）を渡している", async () => {
    const { createGenAI } = await import("@/lib/gemini");
    createGenAI(10_000);
    const retry = constructed.at(-1)?.httpOptions?.retryOptions;
    expect(retry?.attempts).toBe(3);
    expect(retry?.httpStatusCodes).toEqual(expect.arrayContaining([429, 500, 503]));
    expect(retry?.httpStatusCodes).not.toContain(403);
  });

  it("切り替えてよい失敗は、混雑・一時的な障害・モデルが見つからないときだけ", async () => {
    const { isModelUnavailable } = await import("@/lib/gemini");
    for (const s of [404, 408, 429, 500, 503]) expect(isModelUnavailable(apiError(s)), String(s)).toBe(true);
    for (const s of [400, 401, 403]) expect(isModelUnavailable(apiError(s)), String(s)).toBe(false);
    expect(isModelUnavailable(new Error("timeout"))).toBe(false);
  });
});

describe("予備のモデルへの切り替え（プラン作成）", () => {
  it("メインのモデルが混雑していたら、予備のモデルで最初から作り直す", async () => {
    behavior = (model) => (model === "primary-model" ? { throw: apiError(503) } : { calls: [submit] });
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "fb" });
    expect(out.plan.generatedBy).toEqual({ engine: "gemini", model: "backup-model" });
    expect(out.trace.some((t) => t.name === "model_fallback")).toBe(true);
    expect(calledModels[0]).toBe("primary-model");
    expect(calledModels.at(-1)).toBe("backup-model");
  });

  it("権限不足（403）では切り替えず、エラーとして返す（予備のモデルは呼ばない）", async () => {
    behavior = () => ({ throw: apiError(403) });
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await expect(runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "403" })).rejects.toMatchObject({ name: "AgentUnavailableError" });
    expect(calledModels).toEqual(["primary-model"]);
  });

  it("予備のモデルも使えなければ、AI の成功に見せかけずにエラーを返す", async () => {
    behavior = () => ({ throw: apiError(503) });
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await expect(runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "both" })).rejects.toMatchObject({ name: "AgentUnavailableError" });
    expect(calledModels).toEqual(["primary-model", "backup-model"]);
  });
});

describe("予備のモデルへの切り替え（1 回で終わる呼び出し）", () => {
  it("ライブの抽出も、混雑していれば予備のモデルで読み取る", async () => {
    behavior = (model) => (model === "primary-model" ? { throw: apiError(429) } : { calls: [] });
    const { generateWithFallback, createGenAI } = await import("@/lib/gemini");
    const { model } = await generateWithFallback(createGenAI(1000), { contents: [] }, { requestId: "x", route: "detect" });
    expect(model).toBe("backup-model");
  });
});

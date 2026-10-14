import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 応答の速さに関わる設定と、時間切れの扱いを確かめる。
 * - 既定では「考える深さ」を LOW にして送る（道具を何度も呼ぶため、深く考えると制限時間を超えやすい）
 * - 時間切れは「接続できない」ではなく「時間がかかった」と伝える
 */
const seenThinking: unknown[] = [];
let behavior: "ok" | "timeout" | "denied" | "typeerror" = "ok";

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: { config?: { thinkingConfig?: unknown } }) => {
        seenThinking.push(req.config?.thinkingConfig);
        if (behavior === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
        if (behavior === "denied") {
          throw Object.assign(new Error(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Permission denied on project my-secret-project", details: [{ reason: "IAM_PERMISSION_DENIED" }] } })), { status: 403 });
        }
        if (behavior === "typeerror") throw new TypeError("x is not a function");
        const call = { name: "get_free_time_slots", args: {} };
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

describe("AI の応答の速さ", () => {
  beforeEach(() => {
    seenThinking.length = 0;
    behavior = "ok";
    vi.resetModules();
    delete process.env.GEMINI_THINKING_LEVEL;
  });

  it("既定では考える深さを LOW にして送る", async () => {
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "low" }).catch(() => undefined);
    expect(seenThinking[0]).toEqual({ thinkingLevel: "LOW" });
  });

  it("GEMINI_THINKING_LEVEL で変えられ、不正な値ならモデルの既定値に任せる", async () => {
    process.env.GEMINI_THINKING_LEVEL = "medium";
    let { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "medium" }).catch(() => undefined);
    expect(seenThinking[0]).toEqual({ thinkingLevel: "MEDIUM" });

    seenThinking.length = 0;
    vi.resetModules();
    process.env.GEMINI_THINKING_LEVEL = "default";
    ({ runPlanningAgent } = await import("@/lib/agent/orchestrator"));
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "default" }).catch(() => undefined);
    expect(seenThinking[0]).toBeUndefined();
  });

  it("時間切れは「接続できない」ではなく「時間がかかった」と伝える", async () => {
    behavior = "timeout";
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await expect(runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "slow" })).rejects.toThrow(/時間がかかり/);
  });

  it("接続できないときは、理由の種類だけを添える（説明文やプロジェクト名は出さない）", async () => {
    behavior = "denied";
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const err = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "denied" }).catch((e) => e);
    expect(err.reason).toBe("IAM_PERMISSION_DENIED");
    expect(JSON.stringify(err.reason)).not.toContain("my-secret-project");
  });

  it("アプリ側の例外でも、例外の名前を理由として添える", async () => {
    behavior = "typeerror";
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const err = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "type" }).catch((e) => e);
    expect(err.reason).toBe("TypeError");
  });
});

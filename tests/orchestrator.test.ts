import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gemini をモックして、Function Calling の自律ループ（ツール実行 → 差し戻し → 再提出）と
 * 許可リスト外ツールの拒否を検証する。
 */
const scripted: unknown[] = [];
const seenContents: unknown[][] = [];

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: { contents: unknown[] }) => {
        seenContents.push(structuredClone(req.contents));
        const next = scripted.shift() as { calls: { name: string; args: Record<string, unknown> }[] };
        return {
          functionCalls: next.calls.map((c, i) => ({ id: `c${i}`, ...c })),
          candidates: [{ content: { role: "model", parts: next.calls.map((c) => ({ functionCall: c, thoughtSignature: "sig" })) } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
        };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = "test-key";

const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const event = {
  id: "e1", artist: "IVE", title: "IVE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: [] as never[], arriveEarlyForGoods: true,
};
const transit = (end: string) => ({ id: "t1", kind: "transit", title: "長崎駅 出発", start: `${day}T10:00:00+09:00`, end: `${day}T${end}:00+09:00`, rationale: "r", requiresBooking: true });

describe("runPlanningAgent (Gemini loop)", () => {
  beforeEach(() => {
    scripted.length = 0;
    seenContents.length = 0;
  });

  it("executes tools, self-corrects after a rejected submission, and returns a plan", async () => {
    scripted.push(
      { calls: [{ name: "get_free_time_slots", args: { from_date: day, to_date: day } }, { name: "book_salon_now", args: {} }] },
      { calls: [{ name: "submit_timeline", args: { summary: "s", items: [transit("17:50")] } }] }, // 開演 10 分前着 → 差し戻し
      { calls: [{ name: "submit_timeline", args: { summary: "ok", items: [transit("15:00")] } }] },
    );
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "t" });

    expect(out.engine).toBe("gemini");
    expect(out.plan.summary).toBe("ok");
    expect(out.usage.totalTokens).toBe(360);
    const names = out.trace.map((t) => `${t.name}:${t.ok}`);
    expect(names).toContain("book_salon_now:false"); // 許可リスト外は拒否
    expect(names.filter((n) => n.startsWith("submit_timeline"))).toEqual(["submit_timeline:false", "submit_timeline:true"]);
    // 2 ターン目の履歴には model の content（思考署名つき）と functionResponse が積まれている
    const second = seenContents[1] as { role: string; parts: { functionResponse?: { name: string } }[] }[];
    expect(second.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(second[2].parts.map((p) => p.functionResponse?.name)).toEqual(["get_free_time_slots", "book_salon_now"]);
  });
});

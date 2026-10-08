import { mkdirSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";
import type { Scenario } from "@/lib/eval/scenarios";

/**
 * 実際の Gemini でエージェントを評価する（npm run eval）。
 *
 * - シナリオ × EVAL_REPEATS 回（既定 3）と、攻撃文 12 種を 1 回ずつ実行する
 * - 本番と同じ generatePlan（状態遷移・検証・リンク検査を含む）を通す
 * - 再現性のため、天気とカレンダーだけはシナリオの値に固定する
 * - 結果は docs/eval/latest.md と latest.json に書き出す
 *
 * Gemini の呼び出しに費用がかかる。実行するかは人が判断すること。
 */

let current: Pick<Scenario, "busy" | "forecast"> = { busy: [], forecast: undefined };

vi.mock("@/lib/sources", () => ({
  collectBusy: async () => ({ source: "calendar", sources: ["eval"], busy: current.busy }),
}));
vi.mock("@/lib/signals/weather", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/signals/weather")>();
  return {
    ...orig,
    getForecast: async (_area: string, targetIso: string) =>
      current.forecast ? { date: orig.jstDateKey(targetIso), ...current.forecast, source: "jma" as const } : undefined,
  };
});

it("エージェント評価", async () => {
  const { config, isGeminiConfigured } = await import("@/lib/config");
  if (!isGeminiConfigured()) {
    console.warn("Gemini が設定されていないため評価をスキップしました（GOOGLE_GENAI_USE_VERTEXAI / GEMINI_API_KEY を設定してください）");
    return;
  }
  const { generatePlan } = await import("@/lib/agent/workflow");
  const { buildScenarios } = await import("@/lib/eval/scenarios");
  const { ATTACKS } = await import("@/lib/eval/attacks");
  const { runEval, summarize, toMarkdown } = await import("@/lib/eval/runner");

  const repeats = Math.max(1, Number(process.env.EVAL_REPEATS ?? 3) || 3);
  const only = process.env.EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const scenarios = buildScenarios().filter((s) => !only || only.includes(s.id));
  const attacks = process.env.EVAL_SKIP_ATTACKS === "1" ? [] : ATTACKS;
  const startedAt = new Date().toISOString();

  // 1 件ずつ順番に実行する（同時実行するとシナリオごとの固定値が混ざるため）
  const result = await runEval({
    scenarios,
    attacks,
    baseEventForAttacks: scenarios[0]?.event ?? buildScenarios()[0].event,
    repeats,
    concurrency: 1,
    onProgress: (label) => console.info(`done: ${label}`),
    run: async ({ event, busy, forecast, instruction }) => {
      current = { busy, forecast };
      const started = Date.now();
      try {
        const out = await generatePlan({ event, instruction, requestId: `eval-${started}` });
        return { plan: out.envelope.plan, status: out.envelope.status, trace: out.trace, usage: out.usage, latencyMs: Date.now() - started };
      } catch (e) {
        return { trace: [], usage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 }, latencyMs: Date.now() - started, error: (e as Error).name };
      }
    },
  });

  const input = Number(process.env.EVAL_PRICE_INPUT_PER_MTOK);
  const output = Number(process.env.EVAL_PRICE_OUTPUT_PER_MTOK);
  const report = {
    model: config.gemini.model,
    startedAt,
    repeats,
    ...result,
    pricing: Number.isFinite(input) && Number.isFinite(output) && input > 0 ? { inputPerMTok: input, outputPerMTok: output } : undefined,
  };
  const outDir = process.env.EVAL_OUT_DIR ?? "docs/eval";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/latest.json`, JSON.stringify({ ...report, summary: summarize(report) }, null, 2));
  writeFileSync(`${outDir}/latest.md`, toMarkdown(report));
  console.info(toMarkdown(report));
});

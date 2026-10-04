import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { config, isGeminiConfigured } from "../config";
import { randomId } from "../crypto";
import { logger } from "../logger";
import type { BusyBlock } from "../privacy/mask";
import { getEkispertDeclarations } from "../services/ekispert";
import { hotpepperSearchUrl, jalanSearchUrl, safeExternalUrl } from "../safeUrl";
import { toJstIso } from "../time";
import { runRuleBasedPlanner } from "./fallback";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { executeTool, NATIVE_DECLARATIONS, NATIVE_TOOL_NAMES, type AgentContext } from "./tools";
import type { OshiEvent, Plan, SkinAnalysis, TraceStep } from "./types";

export interface AgentRunInput {
  event: OshiEvent;
  busy: readonly BusyBlock[];
  calendarSource: "calendar" | "demo";
  skin?: SkinAnalysis;
  previous?: Plan;
  instruction?: string;
  requestId: string;
  trace?: string;
}

export interface AgentRunOutput {
  plan: Plan;
  trace: TraceStep[];
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
  engine: "gemini" | "rule-based";
}

const DEADLINE_MS = 110_000;

export class AgentUnavailableError extends Error {
  constructor(message = "AI に接続できませんでした。時間をおいて再試行してください") {
    super(message);
    this.name = "AgentUnavailableError";
  }
}

function genai() {
  return config.gemini.useVertex
    ? new GoogleGenAI({ vertexai: true, project: config.gemini.project, location: config.gemini.location, httpOptions: { timeout: 60_000 } })
    : new GoogleGenAI({ apiKey: config.gemini.apiKey, httpOptions: { timeout: 60_000 } });
}

/**
 * 推し活プランニング・エージェント本体（Gemini Function Calling の自律ループ）。
 *
 * ガードレール:
 * - 最大ステップ数・全体タイムアウトで暴走を防止
 * - ツールは許可リスト（ネイティブ + 駅すぱあと MCP）のみ実行
 * - submit_timeline の検証を通過するまで完了扱いにしない（自己修正ループ）
 * - エージェントの出力は常に pending_approval としてユーザーに返す（呼び出し側で状態遷移を強制）
 */
export async function runPlanningAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const ctx: AgentContext = { event: input.event, busy: input.busy, skin: input.skin, now: Date.now(), rejectedSubmissions: 0 };
  const trace: TraceStep[] = [];
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
  let engine: AgentRunOutput["engine"] = "rule-based";
  const logBase = { requestId: input.requestId, trace: input.trace };

  if (isGeminiConfigured()) {
    try {
      engine = "gemini";
      await runGeminiLoop(input, ctx, trace, usage);
    } catch (e) {
      logger.error("agent.gemini.failed", { ...logBase, errorCode: (e as Error).name, httpStatus: (e as { status?: number }).status, model: config.gemini.model });
      throw new AgentUnavailableError();
    }
  }
  if (!ctx.submitted) {
    if (engine === "gemini") {
      // 通信はできたが、決められた回数内にタイムラインを提出できなかった
      logger.error("agent.gemini.incomplete", { ...logBase, steps: config.gemini.maxSteps, model: config.gemini.model });
      throw new AgentUnavailableError("AI がプランを仕上げられませんでした。もう一度お試しください");
    }
    await runRuleBasedPlanner(ctx, trace);
  }
  if (!ctx.submitted) throw new Error("planner produced no timeline");

  // AI が書いた外部リンクは許可リストで検査し、許可外は安全な検索ページに差し替える
  let replacedLinks = 0;
  const items = [...ctx.submitted.items]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((it) => {
      if (!it.provider?.bookingUrl) return it;
      const safe = safeExternalUrl(it.provider.bookingUrl);
      if (safe) return { ...it, provider: { ...it.provider, bookingUrl: safe } };
      replacedLinks++;
      const fallback = it.kind === "stay" ? jalanSearchUrl(it.location ?? it.title) : it.kind === "beauty" ? hotpepperSearchUrl(`${input.event.homeStation} ${it.title}`) : undefined;
      return { ...it, provider: { ...it.provider, bookingUrl: fallback } };
    });
  if (replacedLinks > 0) {
    trace.push({ step: trace.length + 1, type: "guardrail", name: "link_check", ok: true, latencyMs: 0, summary: `安全が確認できないリンク ${replacedLinks} 件を公式の検索ページに差し替えました` });
  }
  const warnings = [...new Set(ctx.submitted.warnings)].slice(0, 10);
  if (input.calendarSource === "demo") warnings.unshift("カレンダー未連携のため、既存予定との重なりは確認できていません。提案日時を必ず確認してください。");
  if (!items.some((i) => i.kind === "transit")) warnings.push("実際の移動経路と所要時間は確認できていません。交通機関の検索サイトで確認してください。");
  if (items.some((i) => i.route?.source === "mock")) warnings.push("移動時間・運賃は目安です。乗車前に必ず最新の情報を確認してください。");

  const plan: Plan = {
    id: input.previous?.id ?? randomId(8),
    event: input.event,
    summary: ctx.submitted.summary,
    decisions: ctx.submitted.decisions.slice(0, 6),
    items,
    warnings: warnings.slice(0, 10),
    generatedBy: { engine, model: engine === "gemini" ? config.gemini.model : "rules-v1" },
    revision: input.previous ? input.previous.revision + 1 : 0,
    createdAt: new Date().toISOString(),
  };
  logger.info("agent.completed", {
    ...logBase,
    mode: engine,
    model: plan.generatedBy.model,
    steps: trace.length,
    itemCount: items.length,
    revision: plan.revision,
    validationErrors: ctx.rejectedSubmissions,
    ...usage,
  });
  return { plan, trace, usage, engine };
}

async function runGeminiLoop(input: AgentRunInput, ctx: AgentContext, trace: TraceStep[], usage: AgentRunOutput["usage"]) {
  const ai = genai();
  const ekispert = await getEkispertDeclarations();
  const declarations: FunctionDeclaration[] = [...(ekispert?.declarations ?? []), ...NATIVE_DECLARATIONS];
  const allowed = new Set([...NATIVE_TOOL_NAMES, ...(ekispert?.declarations.map((d) => d.name!) ?? [])]);
  trace.push({
    step: 1,
    type: "model",
    name: "plan",
    ok: true,
    latencyMs: 0,
    summary: `AI が調べものを開始しました（乗換案内: ${ekispert ? "連携中" : "目安で計算"}）`,
  });

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: buildUserPrompt({
            event: input.event,
            now: toJstIso(ctx.now),
            calendarSource: input.calendarSource,
            hasSkinAnalysis: Boolean(input.skin),
            previous: input.previous,
            instruction: input.instruction,
          }),
        },
      ],
    },
  ];

  const deadline = Date.now() + DEADLINE_MS;
  for (let step = 0; step < config.gemini.maxSteps; step++) {
    if (Date.now() > deadline) throw new Error("agent deadline exceeded");
    const started = Date.now();
    // 残り 2 回になったら提出だけを許可し、調べものの途中で打ち切られて何も返せない事態を防ぐ
    const mustSubmit = step >= config.gemini.maxSteps - 2;
    const res = await ai.models.generateContent({
      model: config.gemini.model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: declarations }],
        // ANY: 必ず何らかのツールを呼ぶ＝最終出力は submit_timeline 経由の構造化データに限定
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            ...(mustSubmit ? { allowedFunctionNames: ["submit_timeline"] } : {}),
          },
        },
        abortSignal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
      },
    });
    usage.promptTokens += res.usageMetadata?.promptTokenCount ?? 0;
    usage.outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;
    usage.totalTokens += res.usageMetadata?.totalTokenCount ?? 0;

    const modelContent = res.candidates?.[0]?.content;
    const calls = res.functionCalls ?? [];
    logger.info("agent.model.turn", { requestId: input.requestId, step, latencyMs: Date.now() - started, itemCount: calls.length, model: config.gemini.model });
    if (!modelContent || calls.length === 0) {
      // テキストで終わってしまった場合は提出を促す（思考署名を保つため model の content はそのまま履歴へ）
      if (modelContent) contents.push(modelContent);
      contents.push({ role: "user", parts: [{ text: "submit_timeline を呼び出してタイムラインを提出してください。" }] });
      continue;
    }
    contents.push(modelContent);

    const responseParts: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const t0 = Date.now();
      const outcome = allowed.has(name)
        ? await executeTool(name, (call.args ?? {}) as Record<string, unknown>, ctx)
        : { ok: false, response: { error: `tool ${name} is not allowed` }, summary: "安全のため、許可されていない操作は実行しませんでした" };
      trace.push({ step: trace.length + 1, type: allowed.has(name) ? "tool" : "guardrail", name, ok: outcome.ok, latencyMs: Date.now() - t0, summary: outcome.summary });
      logger.info("agent.tool", { requestId: input.requestId, tool: name, toolOk: outcome.ok, latencyMs: Date.now() - t0 });
      responseParts.push({ functionResponse: { id: call.id, name, response: outcome.response } });
    }
    contents.push({ role: "user", parts: responseParts });
    if (ctx.submitted) return;
  }
}

import "server-only";
import type { Content, FunctionCallingConfigMode, FunctionDeclaration, Part, ThinkingLevel } from "@google/genai";
import { config, isGeminiConfigured } from "../config";
import { randomId } from "../crypto";
import { createGenAI, geminiErrorInfo, isModelUnavailable, modelCandidates } from "../gemini";
import { logger } from "../logger";
import type { BusyBlock } from "../privacy/mask";
import { venueArea } from "../eventDetection/venues";
import { getEkispertDeclarations, getEkispertStatus, type EkispertStatus } from "../services/ekispert";
import { ekispertRouteSearchUrl, flightSearchUrl, hotpepperSearchUrl, jalanSearchUrl, safeExternalUrl, transitSearchUrl } from "../safeUrl";
import { estimateTravel } from "../services/travelEstimate";
import { isWebSearchEnabled } from "../services/webSearch";
import { toJstIso } from "../time";
import { runRuleBasedPlanner } from "./fallback";
import { COMPAT_SUMMARY, shouldRetryInCompat, toLegacyDeclarations } from "./compat";
import { probeGeminiRequest } from "./probe";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt";
import { executeTool, NATIVE_DECLARATIONS, SUBMIT_RESERVE_MS, WEB_SEARCH_TOOL, type AgentContext } from "./tools";

/** プランに入れられる項目の上限（PlanSchema と同じ） */
const MAX_PLAN_ITEMS = 20;

/**
 * 項目が上限を超えたら、優先度の低いもの（準備 → 美容 → 宿）の、後ろの方から外す。
 * 提出は 20 件まで通るが、自動で足す確認項目（乗り換えの確認・雨具）で 22 件になり、保存（署名）の時点で失敗していた
 */
export function capItems<T extends { id: string; kind: string }>(items: T[]): T[] {
  if (items.length <= MAX_PLAN_ITEMS) return items;
  const drop = new Set<string>();
  for (const kind of ["prep", "beauty", "stay"]) {
    for (const it of [...items].reverse()) {
      if (items.length - drop.size <= MAX_PLAN_ITEMS) break;
      if (it.kind === kind) drop.add(it.id);
    }
  }
  return items.filter((i) => !drop.has(i.id)).slice(0, MAX_PLAN_ITEMS);
}

/** 乗り換えの待機系（所要時間の目安）の道具。主系（駅すぱあと）が使えるときは AI に渡さない */
const TRANSIT_FALLBACK_TOOL = "estimate_travel_time";
import type { OshiEvent, Plan, TimelineItem, TraceStep, WebSearchRecord } from "./types";

export interface AgentRunInput {
  event: OshiEvent;
  busy: readonly BusyBlock[];
  calendarSource: "calendar" | "demo";
  /** 連携しているが、一時的に予定を読めなかった（注意書きの言い方を変える） */
  calendarUnavailable?: boolean;
  previous?: Plan;
  instruction?: string;
  requestId: string;
  trace?: string;
}

export interface AgentRunOutput {
  plan: Plan;
  trace: TraceStep[];
  /** トークン数と、AI（Gemini）の呼び出し回数・待ち時間の合計（画面とログで可観測性に使う） */
  usage: { promptTokens: number; outputTokens: number; totalTokens: number; modelCalls: number; modelLatencyMs: number };
  engine: "gemini" | "rule-based";
}

/**
 * AI（Gemini）に使わせる時間。API の上限（180 秒）・Cloud Run のタイムアウト（既定 300 秒）より十分短くし、
 * 残りは、時間切れのときにルールでプランを組み立てる分として残す（ルールは数秒で終わる）。
 * 本番で AI の応答が遅く 150 秒を使い切り、プランを 1 件も返せないことがあったため
 */
const AI_DEADLINE_MS = 120_000;
/** 1 回の呼び出しの上限。1 回の遅い応答で持ち時間をすべて使わないようにする */
const MODEL_CALL_TIMEOUT_MS = 45_000;

export class AgentUnavailableError extends Error {
  /**
   * 失敗の理由の種類（例: PERMISSION_DENIED、HTTP_400 tools[0]…、TypeError）。画面とレスポンスに出して、ログを見なくても原因の見当が付くようにする。
   * Google の API が返す決まった名前・リクエストの項目名・例外の名前だけで、説明文や利用者のデータは含めない
   */
  readonly reason?: string;
  constructor(message = "AI が混み合っていて、プランを作れませんでした。少し時間をおいて、もう一度お試しください。登録したライブはそのまま残っています", reason?: string) {
    super(message);
    this.name = "AgentUnavailableError";
    this.reason = reason;
  }
}

/** 失敗の理由の種類を、画面に出してよい形（英数字・記号の短い名前）だけで作る */
export function failureReason(e: unknown): string | undefined {
  const info = geminiErrorInfo(e);
  const status = (e as { status?: unknown } | null)?.status;
  const parts = [
    info.apiReason ?? info.apiStatus ?? (typeof status === "number" ? `HTTP_${status}` : (e as Error | null)?.name),
    info.apiField,
  ].filter((p): p is string => typeof p === "string" && /^[\w.[\]-]{1,120}$/.test(p));
  return parts.length ? parts.join(" ").slice(0, 160) : undefined;
}

/** 制限時間内にプランを仕上げられなかった（AI の応答が遅い）。接続の失敗とは分けて扱う */
class AgentDeadlineError extends Error {
  constructor() {
    super("agent deadline exceeded");
    this.name = "AgentDeadlineError";
  }
}

/** 時間切れ（全体の制限時間・1 回の呼び出しの待ち時間）による失敗か */
function isTimeout(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return e instanceof AgentDeadlineError || name === "TimeoutError" || name === "AbortError";
}

/** AI の応答が遅く、ルールで組み立てたときの説明（画面の進み具合と注意書きに出す） */
const RULE_FALLBACK_SUMMARY = "混み合っていたため、決まった手順で組み立てました";

/** 予備のモデルで作り直すのに最低限ほしい残り時間 */
const MIN_TIME_FOR_FALLBACK_MS = 30_000;

/**
 * 推し活プランニング・エージェント本体（Gemini Function Calling の自律ループ）。
 *
 * ガードレール:
 * - 最大ステップ数・全体タイムアウトで暴走を防止
 * - 混雑・一時的な障害は自動で再試行し、それでもだめなら予備のモデル（設定時のみ）で最初から作り直す
 * - ツールは許可リスト（ネイティブ + 駅すぱあと MCP）のみ実行
 * - submit_timeline の検証を通過するまで完了扱いにしない（自己修正ループ）
 * - エージェントの出力は常に pending_approval としてユーザーに返す（呼び出し側で状態遷移を強制）
 */
export async function runPlanningAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const ctx: AgentContext = {
    event: input.event,
    busy: input.busy,
    now: Date.now(),
    rejectedSubmissions: 0,
    venueArea: venueArea(input.event.venue, input.event.venueStation),
    requestId: input.requestId,
    // 作り直しでは、前のプランの検索結果も出典として使える（署名付きのプランから取り出すので改ざんされていない）
    webSearches: input.previous?.webSearches ? [...input.previous.webSearches] : undefined,
  };
  const trace: TraceStep[] = [];
  const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0, modelCalls: 0, modelLatencyMs: 0 };
  let engine: AgentRunOutput["engine"] = "rule-based";
  let model = config.gemini.model;
  const logBase = { requestId: input.requestId, trace: input.trace };

  if (isGeminiConfigured()) {
    engine = "gemini";
    const deadline = Date.now() + AI_DEADLINE_MS;
    ctx.deadline = deadline;
    const models = modelCandidates();
    let compat = 0;
    for (let i = 0; i < models.length; i++) {
      model = models[i];
      try {
        await runGeminiLoop(input, ctx, trace, usage, model, deadline, compat);
        if (compat > 0) logger.warn("agent.gemini.compat_ok", { ...logBase, model, mode: `compat-${compat}` });
        break;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (shouldRetryInCompat(e, usage.modelCalls, compat)) {
          // 最初の呼び出しで形を拒否された。外せる機能を外して、同じモデルで作り直す
          compat += 1;
          logger.warn("agent.gemini.compat", { ...logBase, httpStatus: status, ...geminiErrorInfo(e), model, mode: `compat-${compat}` });
          trace.push({ step: trace.length + 1, type: "guardrail", name: "compat_mode", ok: true, latencyMs: 0, summary: COMPAT_SUMMARY[compat] });
          i -= 1;
          continue;
        }
        const canFallback = i < models.length - 1 && isModelUnavailable(e) && deadline - Date.now() > MIN_TIME_FOR_FALLBACK_MS;
        const timeout = isTimeout(e);
        logger.error("agent.gemini.failed", { ...logBase, errorCode: (e as Error).name, httpStatus: status, ...geminiErrorInfo(e), model, mode: canFallback ? "fallback" : timeout ? "timeout" : "give_up", steps: usage.modelCalls, latencyMs: usage.modelLatencyMs });
        if (!canFallback) {
          // 互換モードでも最初の呼び出しが 400 のときは、どの部品が拒否されるかを切り分けて記録する
          if (status === 400 && usage.modelCalls === 0) {
            await probeGeminiRequest({ requestId: input.requestId, model, systemInstruction: SYSTEM_INSTRUCTION, userPrompt: firstUserPrompt(input, ctx), declarations: NATIVE_DECLARATIONS, toolConfig: toolConfigFor(false) }).catch(() => undefined);
          }
          // 時間切れは、AI の代わりにルールで組み立てて必ずプランを返す（AI で作ったようには見せない）
          if (timeout) {
            engine = "rule-based";
            break;
          }
          throw new AgentUnavailableError(undefined, failureReason(e));
        }
        // 予備のモデルで最初から作り直す。途中の会話には前のモデル専用の情報（思考の署名）が含まれるため引き継がない
        Object.assign(ctx, { submitted: undefined, rejectedSubmissions: 0, ekispertSucceeded: undefined, forecast: undefined, lastRejection: undefined });
        trace.push({ step: trace.length + 1, type: "guardrail", name: "model_fallback", ok: true, latencyMs: 0, summary: "AI が混み合っていたため、別の AI で作り直しています" });
      }
    }
  }
  if (!ctx.submitted) {
    if (engine === "gemini") {
      // 通信はできたが、決められた回数内にタイムラインを提出できなかった（検証で差し戻され続けた等）。
      // 乗っ取られたモデルが言い張り続ける場合もあるため、ここではルールに切り替えずに止める
      logger.error("agent.gemini.incomplete", { ...logBase, steps: config.gemini.maxSteps, model });
      throw new AgentUnavailableError("うまくプランを仕上げられませんでした。もう一度お試しください。登録したライブはそのまま残っています");
    }
    if (isGeminiConfigured()) {
      // AI の時間切れでの切り替え。途中の調べものの結果は使わず、最初から組み立てる
      Object.assign(ctx, { submitted: undefined, rejectedSubmissions: 0, lastRejection: undefined, deadline: undefined });
      trace.push({ step: trace.length + 1, type: "guardrail", name: "rule_fallback", ok: true, latencyMs: 0, summary: RULE_FALLBACK_SUMMARY });
    }
    await runRuleBasedPlanner(ctx, trace);
  }
  if (!ctx.submitted) throw new Error("planner produced no timeline");

  // AI が書いた外部リンクは許可リストで検査し、許可外は安全な検索ページに差し替える
  let replacedLinks = 0;
  const items = [...ctx.submitted.items]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map(withoutUnsourcedNames)
    .map((it) => {
      if (!it.provider?.bookingUrl) return withTransitSearchLink(it, input.event);
      const safe = safeExternalUrl(it.provider.bookingUrl);
      if (safe) return { ...it, provider: { ...it.provider, bookingUrl: safe } };
      replacedLinks++;
      const fallback = it.kind === "stay" ? jalanSearchUrl(it.location ?? it.title) : it.kind === "beauty" ? hotpepperSearchUrl(`${input.event.homeStation} ${it.title}`) : undefined;
      return withTransitSearchLink({ ...it, provider: { ...it.provider, bookingUrl: fallback } }, input.event);
    });
  if (replacedLinks > 0) {
    trace.push({ step: trace.length + 1, type: "guardrail", name: "link_check", ok: true, latencyMs: 0, summary: `安全か確かめられないリンク ${replacedLinks} 件を、公式の検索ページに置き換えました` });
  }
  const warnings = [...new Set(ctx.submitted.warnings)].slice(0, 10);
  if (input.calendarUnavailable) warnings.unshift("カレンダーの予定を読み込めなかったため、既存予定との重なりは確認できていません。提案日時を必ず確認してください。");
  else if (input.calendarSource === "demo") warnings.unshift("カレンダー未連携のため、既存予定との重なりは確認できていません。提案日時を必ず確認してください。");
  // いちばん大事な知らせなので先頭に置く
  if (engine === "rule-based" && isGeminiConfigured()) {
    warnings.unshift("混み合っていたため、今回は決まった手順で組み立てました。お店や宿の候補は入っていません。少し時間をおいて「AIに相談して直す」から頼むと、お店や宿まで調べ直せます。");
  }
  if (!items.some((i) => i.kind === "transit")) warnings.push("移動のしかたとかかる時間は、まだ確認できていません。乗り換え案内のサイトで確かめてください。");
  if (items.some((i) => i.route?.source === "estimate" || i.route?.source === "mock")) {
    warnings.push("移動の所要時間は目安です（列車・時刻・運賃は調べていません）。乗る電車は移動の項目のリンクから必ず確かめてください。");
  }
  const webSourced = items.some((i) => i.provider?.sourceUrl || i.route?.source === "web");
  if (webSourced) {
    warnings.push("Google 検索で見つけた店舗・宿・便と価格は、検索した時点の参考です。空席・空室と最新の価格は、出典や予約サイトで必ず確かめてください。");
  }

  const plan: Plan = {
    id: input.previous?.id ?? randomId(8),
    event: input.event,
    summary: ctx.submitted.summary,
    decisions: ctx.submitted.decisions.slice(0, 6),
    items: capItems(items),
    // 検索候補（Search Suggestions）の表示が必要なため、検索で見つけたものを使ったときは検索結果を残す
    // プランが出典として使っている検索結果だけを残す（作り直しても、使っている出典は消えない。封筒も大きくしすぎない）
    ...(webSourced && usedSearches(ctx.webSearches, items).length ? { webSearches: usedSearches(ctx.webSearches, items) } : {}),
    warnings: warnings.slice(0, 10),
    generatedBy: { engine, model: engine === "gemini" ? model : "rules-v1" },
    // 版番号には上限（50）があるため、見直しが続いても超えないようにする
    revision: input.previous ? Math.min(input.previous.revision + 1, 50) : 0,
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

/** 飛行機の移動か（検索で見つけた便、または目安の主な手段が飛行機）。「飛行機は使わない」のような文では判定しない */
export function isAirTravel(item: TimelineItem): boolean {
  return item.category === "flight" || item.route?.source === "web" || /(：|^)飛行機で/.test(item.route?.summary ?? "");
}

/** プランの項目が出典として使っている検索結果（最大 6 件） */
function usedSearches(records: readonly WebSearchRecord[] | undefined, items: readonly TimelineItem[]): WebSearchRecord[] {
  const used = new Set(items.flatMap((i) => [i.provider?.sourceUrl, i.route?.sourceUrl]).filter((u): u is string => Boolean(u)));
  return (records ?? []).filter((r) => r.sources.some((s) => used.has(s.uri))).slice(-6);
}

/** Google 検索で見つけたもの（出典あり）でない宿は、実在の施設名を出さず、予約サイトで探す案内にする */
const GENERIC_STAY = "予約サイトで宿と空室を確認";
export function withoutUnsourcedNames(item: TimelineItem): TimelineItem {
  if (item.kind !== "stay" || !item.provider || item.provider.sourceUrl || item.provider.name === GENERIC_STAY) return item;
  return { ...item, provider: { name: GENERIC_STAY, bookingUrl: item.provider.bookingUrl } };
}

/** 道具の使わせ方の指定。既定の AUTO では何も送らない（ANY は一部の環境で拒否されるため。config.ts 参照） */
function toolConfigFor(mustSubmit: boolean) {
  const mode = config.gemini.toolMode;
  if (mode === "AUTO") return undefined;
  return {
    functionCallingConfig: {
      mode: mode as FunctionCallingConfigMode,
      ...(mustSubmit && mode === "ANY" ? { allowedFunctionNames: ["submit_timeline"] } : {}),
    },
  };
}

/** 最初に AI へ送る依頼文 */
function firstUserPrompt(input: AgentRunInput, ctx: AgentContext): string {
  return buildUserPrompt({
    event: input.event,
    now: toJstIso(ctx.now),
    calendarSource: input.calendarSource,
    previous: input.previous,
    instruction: input.instruction,
  });
}

/**
 * 移動の項目（実経路・目安・確認項目とも）に、出発駅と到着駅を入れた乗り換え案内の検索リンクを付ける。
 * 駅すぱあとで調べた経路は駅すぱあと、目安や確認項目は Google マップの乗換検索で、1 回押すだけで確かめられるようにする
 */
function withTransitSearchLink(item: TimelineItem, event: OshiEvent): TimelineItem {
  const isTransit = item.kind === "transit" || (item.kind === "prep" && item.category === "transit-check");
  if (!isTransit || item.provider?.bookingUrl) return item;
  // 帰り（開演より後の移動）は会場の駅から自宅の最寄り駅へ
  const isReturn = Date.parse(item.start) >= Date.parse(event.startAt);
  const from = item.route?.from ?? (isReturn ? event.venueStation : event.homeStation);
  const to = item.route?.to ?? (isReturn ? event.homeStation : event.venueStation);
  const byEkispert = item.route?.source === "ekispert";
  // 飛行機（検索で見つけた便・目安で飛行機を使う移動）は、空席と運賃を Google フライトで確かめられるようにする
  const byAir = isAirTravel(item);
  if (byAir) {
    const legs = item.route?.legs ?? [];
    // 便が分からない（目安の）ときは、出発駅・会場から空港を推定する。帰りは往路の空港を入れ替える
    const outbound = legs.length ? undefined : estimateTravel({ from: isReturn ? to : from, to: isReturn ? from : to, venue: event.venue }).airports;
    const airports = outbound && isReturn ? { from: outbound.to, to: outbound.from } : outbound;
    return {
      ...item,
      provider: {
        name: item.provider?.name ?? "Google フライトで空席と運賃を確認",
        bookingUrl: flightSearchUrl(legs[0]?.from ?? airports?.from ?? from, legs.at(-1)?.to ?? airports?.to ?? to, toJstIso(Date.parse(item.start))),
      },
    };
  }
  return {
    ...item,
    provider: {
      name: item.provider?.name ?? (byEkispert ? "駅すぱあとで経路を検索" : "Google マップで乗り換えを検索"),
      bookingUrl: byEkispert ? ekispertRouteSearchUrl(from, to) : transitSearchUrl(from, to),
    },
  };
}

/** 乗り換えをどう調べるかを、利用者に分かる言葉で書く（「AI が調べたこと」に出す） */
function transitNote(status: EkispertStatus | "compat"): string {
  switch (status) {
    case "ready":
      return "乗り換えは駅すぱあとで調べます。使えなければ所要時間の目安に切り替えます";
    // 使えない理由（キーの設定・接続の状態）は開発者向けの情報なので画面には出さない（ログで確かめる）
    default:
      return "乗り換えは、所要時間の目安で計算します";
  }
}

async function runGeminiLoop(input: AgentRunInput, ctx: AgentContext, trace: TraceStep[], usage: AgentRunOutput["usage"], model: string, deadline: number, compat = 0) {
  const ai = createGenAI(60_000);
  // 互換モード 1 では考える深さの指定を外し、駅すぱあと MCP の道具は引数定義を従来の形式にして残す。
  // 2 では駅すぱあと MCP の道具を外し、アプリの道具の引数定義も従来の形式にする（乗り換えは最後まで残す）
  const ekispert = compat >= 2 ? null : await getEkispertDeclarations();
  const ekispertDeclarations = ekispert ? (compat >= 1 ? toLegacyDeclarations(ekispert.declarations) : ekispert.declarations) : [];
  // 駅すぱあとが使えるときは、経路を調べない予備の道具を渡さない（AI が楽な方を選んで乗り換えを調べないのを防ぐ）
  const nativeBase = NATIVE_DECLARATIONS.filter(
    // 互換モード 2 では Google 検索の道具も外す（最初の呼び出しで形を拒否されたとき、増やした部分を減らして通す）
    (d) => !(ekispertDeclarations.length > 0 && d.name === TRANSIT_FALLBACK_TOOL) && !(d.name === WEB_SEARCH_TOOL && (!isWebSearchEnabled() || compat >= 2)),
  );
  const native = compat >= 2 ? toLegacyDeclarations(nativeBase) : nativeBase;
  const declarations: FunctionDeclaration[] = [...ekispertDeclarations, ...native];
  const allowed = new Set([...native.map((d) => d.name!), ...ekispertDeclarations.map((d) => d.name!)]);
  trace.push({
    step: trace.length + 1,
    type: "model",
    name: "plan",
    ok: true,
    latencyMs: 0,
    summary: `AI が調べものを始めました（${transitNote(ekispert ? "ready" : compat >= 2 && getEkispertStatus() === "ready" ? "compat" : getEkispertStatus())}）`,
  });

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        { text: firstUserPrompt(input, ctx) },
      ],
    },
  ];

  for (let step = 0; step < config.gemini.maxSteps; step++) {
    if (Date.now() > deadline) throw new AgentDeadlineError();
    const started = Date.now();
    // 残り 2 回になったら、または締め切りが近づいたら提出だけを許可し、調べものの途中で打ち切られて何も返せない事態を防ぐ
    const mustSubmit = step >= config.gemini.maxSteps - 2 || deadline - Date.now() < SUBMIT_RESERVE_MS;
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // 残り 2 回は提出用の道具だけを渡す（どの使わせ方でも、調べものの途中で打ち切られずに提出できる）
        tools: [{ functionDeclarations: mustSubmit ? declarations.filter((d) => d.name === "submit_timeline") : declarations }],
        // AUTO のときは指定を送らない（ANY は一部の環境で拒否されるため既定にしない。config.ts 参照）
        ...(toolConfigFor(mustSubmit) ? { toolConfig: toolConfigFor(mustSubmit) } : {}),
        abortSignal: AbortSignal.timeout(Math.min(MODEL_CALL_TIMEOUT_MS, Math.max(5_000, deadline - Date.now()))),
        ...(config.gemini.thinkingLevel && compat === 0 ? { thinkingConfig: { thinkingLevel: config.gemini.thinkingLevel as ThinkingLevel } } : {}),
      },
    });
    usage.modelCalls += 1;
    usage.modelLatencyMs += Date.now() - started;
    usage.promptTokens += res.usageMetadata?.promptTokenCount ?? 0;
    usage.outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;
    usage.totalTokens += res.usageMetadata?.totalTokenCount ?? 0;

    const modelContent = res.candidates?.[0]?.content;
    const calls = res.functionCalls ?? [];
    logger.info("agent.model.turn", { requestId: input.requestId, step, latencyMs: Date.now() - started, itemCount: calls.length, model });
    if (!modelContent || calls.length === 0) {
      // テキストで終わってしまった場合は提出を促す（思考署名を保つため model の content はそのまま履歴へ）
      if (modelContent) contents.push(modelContent);
      contents.push({ role: "user", parts: [{ text: "submit_timeline を呼び出してタイムラインを提出してください。" }] });
      continue;
    }
    contents.push(modelContent);

    const run = async (call: (typeof calls)[number]) => {
      const name = call.name ?? "";
      const t0 = Date.now();
      const outcome = allowed.has(name)
        ? await executeTool(name, (call.args ?? {}) as Record<string, unknown>, ctx)
        : { ok: false, response: { error: `tool ${name} is not allowed` }, summary: "安全のため、許可されていない操作は実行しませんでした" };
      return { call, name, outcome, latencyMs: Date.now() - t0 };
    };
    // 調べものの道具は互いに独立しているので、同時に実行する（Google 検索 3 件を順番に待つと、それだけで 1 分以上かかり時間切れになっていた）。
    // 提出（submit_timeline）は、同じ回の調べものの結果（天気・検索の出典）を使って検証するため、そのあとで実行する
    const research = calls.filter((c) => c.name !== "submit_timeline");
    const submits = calls.filter((c) => c.name === "submit_timeline");
    const results = await Promise.all(research.map(run));
    for (const c of submits) results.push(await run(c));
    const byCall = new Map(results.map((r) => [r.call, r]));
    const responseParts: Part[] = [];
    // 記録と応答は、AI が呼んだ順に並べる
    for (const call of calls) {
      const { name, outcome, latencyMs } = byCall.get(call)!;
      trace.push({ step: trace.length + 1, type: allowed.has(name) ? "tool" : "guardrail", name, ok: outcome.ok, latencyMs, summary: outcome.summary });
      logger.info("agent.tool", { requestId: input.requestId, tool: name, toolOk: outcome.ok, latencyMs });
      responseParts.push({ functionResponse: { id: call.id, name, response: outcome.response } });
    }
    contents.push({ role: "user", parts: responseParts });
    if (ctx.submitted) return;
  }
}

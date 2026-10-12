import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FunctionDeclaration } from "@google/genai";
import { config, isEkispertConfigured } from "../config";
import { logger } from "../logger";

/**
 * 駅すぱあと API MCP サーバー（Streamable HTTP）へのブリッジ。
 *
 * MCP の tools/list で公開されているツールを動的に取得し、Gemini の FunctionDeclaration に変換する。
 * これにより MCP 側でツールが追加・変更されてもコード変更なしで Gemini が自律的に利用できる。
 * ツール名は Gemini の制約（英数字・_・-、64 文字以内）に合わせて `ekispert_` を前置して正規化する。
 */
export const EKISPERT_PREFIX = "ekispert_";
/** 道具の一覧の取得は短めに待つ（プラン作成全体の制限時間を使い切らないため） */
const LIST_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 12_000;
/** 取得に失敗したら、この間は再試行せずアプリ側の道具だけで進める（毎回待たせない） */
const FAILURE_TTL_MS = 10 * 60_000;
let failedAt = 0;
const MAX_RESULT_CHARS = 12_000;

interface CachedTools {
  at: number;
  declarations: FunctionDeclaration[];
  nameMap: Map<string, string>;
}
let cache: CachedTools | null = null;

async function withClient<T>(fn: (c: Client) => Promise<T>, timeout: number): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(config.ekispert.mcpUrl), {
    requestInit: { headers: { "ekispert-api-access-key": config.ekispert.accessKey ?? "" } },
  });
  const client = new Client({ name: "oshiready", version: "0.1.0" });
  await client.connect(transport, { timeout });
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * AI に渡してよい駅すぱあとのツールを絞り込む（MCP 側が想定外のツールを公開しても AI に渡さない）。
 * - EKISPERT_ALLOWED_TOOLS（カンマ区切り）が設定されていれば、その名前だけを許可
 * - 未設定なら、経路・駅・時刻表の「検索」系と判断できるものだけを許可
 */
export function isAllowedTool(name: string, description = ""): boolean {
  const explicit = (process.env.EKISPERT_ALLOWED_TOOLS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (explicit.length > 0) return explicit.includes(name);
  const text = `${name} ${description}`.toLowerCase();
  const searchLike = /(route|course|search|station|timetable|fare|探索|経路|駅|時刻|運賃)/.test(text);
  const writeLike = /(create|update|delete|register|post|book|reserve|purchase|登録|削除|予約|購入)/.test(text);
  return searchLike && !writeLike;
}

function sanitizeName(name: string): string {
  return (EKISPERT_PREFIX + name.replace(/[^a-zA-Z0-9_-]/g, "_")).slice(0, 64);
}

/** Gemini の parametersJsonSchema が解釈しないメタキーワードを除去 */
function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "$schema" || k === "$id" || k === "additionalProperties") continue;
      out[k] = cleanSchema(v);
    }
    return out;
  }
  return schema;
}

/**
 * Gemini（Vertex AI）が受け付けない引数定義を避ける。
 * 引数が無い道具の「空の object」（properties: {}）や空の required は 400 INVALID_ARGUMENT になるため省く
 */
export function geminiParameters(schema: unknown): { parametersJsonSchema?: unknown } {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const s = { ...(schema as Record<string, unknown>) };
  if (Array.isArray(s.required) && s.required.length === 0) delete s.required;
  const props = s.properties;
  const emptyObject = s.type === "object" && (!props || (typeof props === "object" && Object.keys(props as object).length === 0));
  return emptyObject ? {} : { parametersJsonSchema: s };
}

export async function getEkispertDeclarations(): Promise<{ declarations: FunctionDeclaration[]; nameMap: Map<string, string> } | null> {
  if (!isEkispertConfigured()) return null;
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache;
  if (Date.now() - failedAt < FAILURE_TTL_MS) return null;
  const started = Date.now();
  try {
    const tools = await withClient((c) => c.listTools(undefined, { timeout: LIST_TIMEOUT_MS }), LIST_TIMEOUT_MS);
    const nameMap = new Map<string, string>();
    const exposed = tools.tools.filter((t) => isAllowedTool(t.name, t.description));
    const declarations: FunctionDeclaration[] = exposed.map((t) => {
      const name = sanitizeName(t.name);
      nameMap.set(name, t.name);
      return {
        name,
        description: `[駅すぱあと API MCP] ${t.description ?? t.name}`.slice(0, 1000),
        ...geminiParameters(cleanSchema(t.inputSchema)),
      };
    });
    cache = { at: Date.now(), declarations, nameMap };
    logger.info("ekispert.listTools", { latencyMs: Date.now() - started, itemCount: declarations.length, candidates: tools.tools.length });
    return cache;
  } catch (e) {
    failedAt = Date.now();
    const code = (e as { code?: unknown }).code;
    logger.warn("ekispert.listTools.failed", { latencyMs: Date.now() - started, errorCode: (e as Error).name, httpStatus: typeof code === "number" ? code : undefined });
    return null;
  }
}

export async function callEkispertTool(geminiName: string, args: Record<string, unknown>): Promise<unknown> {
  const original = cache?.nameMap.get(geminiName);
  if (!original) return { error: "unknown ekispert tool" };
  const started = Date.now();
  try {
    const res = await withClient((c) =>
      c.callTool({ name: original, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS }),
    CALL_TIMEOUT_MS);
    const text = (Array.isArray(res.content) ? res.content : [])
      .map((p: { type?: string; text?: string }) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .slice(0, MAX_RESULT_CHARS);
    logger.info("ekispert.callTool", { tool: original, latencyMs: Date.now() - started, toolOk: !res.isError });
    return { result: text, isError: Boolean(res.isError) };
  } catch (e) {
    logger.warn("ekispert.callTool.failed", { tool: original, latencyMs: Date.now() - started, errorCode: (e as Error).name });
    return { error: "駅すぱあと MCP の呼び出しに失敗しました。search_transit_route_mock で概算してください。" };
  }
}

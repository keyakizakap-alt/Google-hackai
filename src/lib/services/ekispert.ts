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
/**
 * 取得に失敗したら、この間は再試行せずアプリ側の道具だけで進める（毎回待たせない）。
 * 一時的な失敗で長く使えなくならないよう、短めにしている
 */
const FAILURE_TTL_MS = 2 * 60_000;
let failedAt = 0;
const MAX_RESULT_CHARS = 12_000;

/** 駅すぱあとが使えるかどうかと、使えない理由（「AI が調べたこと」に出す） */
export type EkispertStatus = "unconfigured" | "failed" | "no_tools" | "ready";
let lastStatus: EkispertStatus = "unconfigured";
export const getEkispertStatus = (): EkispertStatus => (isEkispertConfigured() ? lastStatus : "unconfigured");

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
 *
 * 駅すぱあとの「探索条件の生成」のように、名前に create / generate を含んでも調べものに使う道具がある。
 * 作るのが「条件・経路・URL」なら許可し、予約・削除・購入などの書き込みは今までどおり許可しない
 */
export function isAllowedTool(name: string, description = ""): boolean {
  const explicit = (process.env.EKISPERT_ALLOWED_TOOLS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (explicit.length > 0) return explicit.includes(name);
  const text = `${name} ${description}`.toLowerCase();
  // 英単語は語ごとに比べる（postal・notebook のような別の語に反応しないように）
  const words = new Set(text.split(/[^a-z]+/));
  const hasWord = (list: string[]) => list.some((w) => words.has(w));
  const searchLike = /(route|course|search|station|timetable|fare|price|range|condition|geo|address|探索|経路|駅|時刻|運賃|条件|範囲|住所)/.test(text);
  const writeLike =
    hasWord(["update", "delete", "remove", "register", "post", "book", "booking", "reserve", "reservation", "purchase", "buy", "cancel"]) ||
    /(登録|削除|予約|購入|注文|取り消)/.test(text);
  const creates = hasWord(["create", "generate"]) || /(作成|生成)/.test(text);
  const createsSearchInput = /(condition|course|route|url|link|条件|経路|探索)/.test(text);
  return searchLike && !writeLike && (!creates || createsSearchInput);
}

function sanitizeName(name: string): string {
  return (EKISPERT_PREFIX + name.replace(/[^a-zA-Z0-9_-]/g, "_")).slice(0, 64);
}

const SCHEMA_TYPES = new Set(["object", "string", "integer", "number", "boolean", "array"]);
const MAX_SCHEMA_DEPTH = 8;

/**
 * MCP の引数定義（JSON Schema）を、Gemini が確実に受け付ける範囲に整える。
 * 駅すぱあと側の定義の形は実行時まで分からないため、受け付けられないことがある書き方を直す:
 * - $ref / $defs → 参照先を展開する（同じ文書内のものだけ）
 * - anyOf / oneOf / allOf、type: ["string", "null"] → null でない最初の型にまとめる
 * - format・default・examples など → 説明文に移す（意味は残す）
 * - 文字列以外の enum → 外して説明文に移す
 */
export function normalizeMcpSchema(schema: unknown, root: unknown = schema, depth = 0): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || depth > MAX_SCHEMA_DEPTH) return undefined;
  let s = schema as Record<string, unknown>;

  if (typeof s.$ref === "string") {
    const target = resolveRef(root, s.$ref);
    if (!target) return { type: "string", ...(typeof s.description === "string" ? { description: s.description } : {}) };
    s = { ...target, ...(typeof s.description === "string" ? { description: s.description } : {}) };
  }
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const branches = s[key];
    if (!Array.isArray(branches)) continue;
    const merged = key === "allOf"
      ? Object.assign({}, ...branches.filter((b) => b && typeof b === "object"))
      : branches.find((b) => b && typeof b === "object" && (b as Record<string, unknown>).type !== "null");
    if (merged) {
      const { [key]: _drop, ...rest } = s;
      void _drop;
      return normalizeMcpSchema({ ...merged, ...rest }, root, depth + 1);
    }
  }

  const out: Record<string, unknown> = {};
  const notes: string[] = [];
  const rawType = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  const type = typeof rawType === "string" && SCHEMA_TYPES.has(rawType) ? rawType : s.properties ? "object" : s.items ? "array" : undefined;
  if (type) out.type = type;

  if (Array.isArray(s.enum)) {
    if (s.enum.every((v) => typeof v === "string")) out.enum = s.enum;
    else notes.push(`指定できる値: ${s.enum.map(String).join(" / ")}`);
  }
  if (typeof s.format === "string") notes.push(`形式: ${s.format}`);
  if (s.default !== undefined && typeof s.default !== "object") notes.push(`省略時: ${String(s.default)}`);
  if (typeof s.pattern === "string") notes.push(`書式: ${s.pattern}`);
  const description = [typeof s.description === "string" ? s.description : typeof s.title === "string" ? s.title : "", notes.length ? `（${notes.join("、")}）` : ""].join("").trim();
  if (description) out.description = description.slice(0, 500);

  for (const k of ["minimum", "maximum", "minItems", "maxItems"] as const) {
    if (typeof s[k] === "number") out[k] = s[k];
  }

  if (type === "object" && s.properties && typeof s.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      const child = normalizeMcpSchema(v, root, depth + 1);
      if (child) props[k] = child;
    }
    if (Object.keys(props).length > 0) out.properties = props;
    const required = Array.isArray(s.required) ? s.required.filter((r): r is string => typeof r === "string" && r in props) : [];
    if (required.length > 0) out.required = required;
  }
  if (type === "array") {
    out.items = normalizeMcpSchema(s.items, root, depth + 1) ?? { type: "string" };
  }
  return out;
}

/** "#/$defs/Name" や "#/definitions/Name" のような、同じ文書内の参照だけをたどる */
function resolveRef(root: unknown, ref: string): Record<string, unknown> | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return node && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>) : undefined;
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
  if (cache && Date.now() - cache.at < 10 * 60_000) {
    lastStatus = "ready";
    return cache;
  }
  // 待っている間は、前回の理由（failed / no_tools）をそのまま使う
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
        ...geminiParameters(normalizeMcpSchema(t.inputSchema)),
      };
    });
    // 道具の名前は判断の手がかりになるため記録する（中身は駅すぱあとの公開情報で、個人のデータは含まない）
    logger.info("ekispert.listTools", {
      latencyMs: Date.now() - started,
      itemCount: declarations.length,
      candidates: tools.tools.length,
      tools: exposed.map((t) => t.name).join(","),
      hiddenTools: tools.tools.filter((t) => !exposed.includes(t)).map((t) => t.name).join(","),
    });
    if (declarations.length === 0) {
      // 使える道具が 1 つもないときは、つながっていても「使えない」として扱う（失敗と同じく少し待ってから取り直す）
      failedAt = Date.now();
      lastStatus = "no_tools";
      return null;
    }
    cache = { at: Date.now(), declarations, nameMap };
    lastStatus = "ready";
    return cache;
  } catch (e) {
    failedAt = Date.now();
    lastStatus = "failed";
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
    return { error: "駅すぱあと MCP の呼び出しに失敗しました。もう一度呼ぶか、時刻を作らずに kind=prep, category=transit-check の確認項目を入れてください。" };
  }
}

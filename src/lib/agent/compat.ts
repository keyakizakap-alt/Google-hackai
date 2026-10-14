import type { FunctionDeclaration, Schema } from "@google/genai";

/**
 * Gemini がリクエストを「形が正しくない」（400 INVALID_ARGUMENT）と拒否したときの互換モード。
 * 拒否の説明に項目名が含まれないことがあるため、外せる機能を段階的に外して作り直し、
 * どの段階で通ったかをログに残す（次の調査で原因を特定するため）。
 *
 * 0: 通常（駅すぱあと MCP の道具・考える深さの指定・JSON Schema 形式の引数定義）
 * 1: 考える深さの指定を外し、駅すぱあと MCP の道具の引数定義を従来の形式（OpenAPI 形式の parameters）に変換する
 * 2: さらに駅すぱあと MCP の道具を外し、アプリの道具の引数定義も従来の形式にする
 */
export const MAX_COMPAT_LEVEL = 2;

export const COMPAT_SUMMARY: Record<number, string> = {
  1: "より確実な方法に切り替えて、プランを作り直しています",
  2: "より確実な方法に切り替えて、プランを作り直しています（乗り換えは所要時間の目安、Google 検索は使いません）",
};

const TYPE_MAP: Record<string, string> = {
  object: "OBJECT",
  string: "STRING",
  integer: "INTEGER",
  number: "NUMBER",
  boolean: "BOOLEAN",
  array: "ARRAY",
};

/** JSON Schema（この アプリで使っている範囲）を、Gemini の従来の引数定義（OpenAPI 形式）に変換する */
export function toOpenApiSchema(json: unknown): Schema | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const s = json as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof s.type === "string" && TYPE_MAP[s.type]) out.type = TYPE_MAP[s.type];
  if (typeof s.description === "string") out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum.map(String);
  if (typeof s.minimum === "number") out.minimum = s.minimum;
  if (typeof s.maximum === "number") out.maximum = s.maximum;
  if (typeof s.minItems === "number") out.minItems = String(s.minItems);
  if (typeof s.maxItems === "number") out.maxItems = String(s.maxItems);
  if (s.properties && typeof s.properties === "object") {
    const props = Object.fromEntries(
      Object.entries(s.properties as Record<string, unknown>)
        .map(([k, v]) => [k, toOpenApiSchema(v)] as const)
        .filter(([, v]) => v !== undefined),
    );
    if (Object.keys(props).length > 0) out.properties = props;
  }
  if (Array.isArray(s.required) && s.required.length > 0) out.required = s.required.map(String);
  const items = toOpenApiSchema(s.items);
  if (items) out.items = items;
  return out as Schema;
}

/** 互換モード 2 用に、道具の定義を従来の形式へ変換する */
export function toLegacyDeclarations(declarations: FunctionDeclaration[]): FunctionDeclaration[] {
  return declarations.map(({ parametersJsonSchema, ...rest }) => {
    const parameters = toOpenApiSchema(parametersJsonSchema);
    return parameters ? { ...rest, parameters } : rest;
  });
}

/** 互換モードで作り直すべき失敗か（最初の呼び出しで、入力の形を拒否された） */
export function shouldRetryInCompat(e: unknown, modelCallsSoFar: number, level: number): boolean {
  return (e as { status?: unknown } | null)?.status === 400 && modelCallsSoFar === 0 && level < MAX_COMPAT_LEVEL;
}

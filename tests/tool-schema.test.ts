import { describe, expect, it } from "vitest";
import { NATIVE_DECLARATIONS } from "@/lib/agent/tools";
import { geminiParameters } from "@/lib/services/ekispert";

/**
 * Gemini（Vertex AI）に渡す道具の定義が、受け付けられる形になっているかを確かめる。
 * 空の object（properties: {}）や空の required があると、最初の呼び出しで 400 INVALID_ARGUMENT になり、
 * プランが 1 つも作れなくなる（本番で実際に起きた）。
 */
function problems(schema: unknown, path: string, out: string[]) {
  if (Array.isArray(schema)) schema.forEach((s, i) => problems(s, `${path}[${i}]`, out));
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return out;
  const s = schema as Record<string, unknown>;
  if (s.type === "object" && (!s.properties || Object.keys(s.properties as object).length === 0)) out.push(`${path}: 空の object`);
  if (Array.isArray(s.required) && s.required.length === 0) out.push(`${path}: 空の required`);
  for (const [k, v] of Object.entries(s)) problems(v, `${path}.${k}`, out);
  return out;
}

describe("Gemini に渡す道具の定義", () => {
  it("空の object や空の required を含まない", () => {
    const found = NATIVE_DECLARATIONS.flatMap((d) => problems(d.parametersJsonSchema, d.name ?? "?", []));
    expect(found).toEqual([]);
  });

  it("駅すぱあとの道具でも、引数が無い定義は省き、空の required は外す", () => {
    expect(geminiParameters({ type: "object", properties: {} })).toEqual({});
    expect(geminiParameters({ type: "object" })).toEqual({});
    expect(geminiParameters(undefined)).toEqual({});
    expect(geminiParameters({ type: "object", properties: { from: { type: "string" } }, required: [] })).toEqual({
      parametersJsonSchema: { type: "object", properties: { from: { type: "string" } } },
    });
  });
});

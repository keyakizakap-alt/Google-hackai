import { beforeEach, describe, expect, it, vi } from "vitest";

// 設定はインポート時に読み込まれるため、ほかのインポートより先にキーを入れる
vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-key";
});
import { isAllowedTool, normalizeMcpSchema } from "@/lib/services/ekispert";
import { ekispertRouteSearchUrl, safeExternalUrl, transitSearchUrl } from "@/lib/safeUrl";

/**
 * 駅すぱあと MCP を使って乗り換えを調べられるようにするための確認。
 * 道具の名前・引数の形は駅すぱあと側で決まるため、想定と違う形でも AI に渡せることを確かめる。
 */
describe("AI に渡す駅すぱあとの道具", () => {
  it("探索条件を作る道具は、名前に create を含んでも渡す", () => {
    expect(isAllowedTool("ekispert_api_create_search_condition", "経路探索の探索条件を生成します")).toBe(true);
    expect(isAllowedTool("ekispert_api_generate_course_condition")).toBe(true);
  });

  it("住所から駅を探す道具は、説明に postal があっても渡す", () => {
    expect(isAllowedTool("ekispert_api_get_stations_from_address", "Search stations near an address or postal code")).toBe(true);
    expect(isAllowedTool("ekispert_api_search_ranges", "所要時間・乗換回数を指定した範囲探索")).toBe(true);
  });

  it("予約・購入・削除と、検索に関係しないものを作る道具は渡さない", () => {
    expect(isAllowedTool("ekispert_api_book_ticket", "乗車券の予約")).toBe(false);
    expect(isAllowedTool("ekispert_api_purchase_pass", "定期券を購入")).toBe(false);
    expect(isAllowedTool("ekispert_api_delete_history", "検索履歴を削除")).toBe(false);
    expect(isAllowedTool("ekispert_api_create_account", "アカウントを作成")).toBe(false);
  });
});

describe("normalizeMcpSchema", () => {
  it("参照・null を許す書き方・Gemini が受け付けない項目を整える", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      $defs: { Station: { type: "string", description: "駅名" } },
      properties: {
        from: { $ref: "#/$defs/Station" },
        to: { anyOf: [{ type: "null" }, { type: "string", description: "到着駅" }] },
        date: { type: ["string", "null"], format: "date", description: "日付" },
        searchType: { type: "integer", enum: [1, 2], default: 1 },
        via: { type: "array", items: { $ref: "#/$defs/Station" } },
      },
      required: ["from", "missing"],
    };
    expect(normalizeMcpSchema(schema)).toEqual({
      type: "object",
      properties: {
        from: { type: "string", description: "駅名" },
        to: { type: "string", description: "到着駅" },
        date: { type: "string", description: "日付（形式: date）" },
        searchType: { type: "integer", description: "（指定できる値: 1 / 2、省略時: 1）" },
        via: { type: "array", items: { type: "string", description: "駅名" } },
      },
      required: ["from"],
    });
  });

  it("自分自身を参照し続ける定義でも止まる", () => {
    const schema = { type: "object", $defs: { Node: { type: "object", properties: { next: { $ref: "#/$defs/Node" } } } }, properties: { root: { $ref: "#/$defs/Node" } } };
    expect(() => normalizeMcpSchema(schema)).not.toThrow();
  });
});

describe("乗り換え案内の検索リンク", () => {
  it("出発駅と到着駅を入れ、許可リストを通る", () => {
    const url = ekispertRouteSearchUrl("長崎", "ドーム前千代崎");
    expect(url).toBe(`https://roote.ekispert.net/result?dep=${encodeURIComponent("長崎")}&arr=${encodeURIComponent("ドーム前千代崎")}`);
    expect(safeExternalUrl(url)).toBe(url);
  });

  it("駅名が空なら駅すぱあとのトップページにする", () => {
    expect(ekispertRouteSearchUrl(" ", "東京")).toBe("https://roote.ekispert.net/");
  });
});

/* ---------- AI の作り直し（互換モード）で駅すぱあとを残す ---------- */

type Req = { config?: { thinkingConfig?: unknown; tools?: { functionDeclarations?: Record<string, unknown>[] }[] } };
const seen: Req[] = [];
let rejectFirst = 0;
const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);

vi.mock("@/lib/services/ekispert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ekispert")>();
  return {
    ...actual,
    getEkispertStatus: () => "ready",
    // 主系の呼び出しは失敗させ、待機系への切り替えを確かめる
    callEkispertTool: async () => ({ error: "駅すぱあと MCP の呼び出しに失敗しました" }),
    getEkispertDeclarations: async () => ({
      declarations: [{ name: "ekispert_api_search_course", description: "[駅すぱあと API MCP] 経路探索", parametersJsonSchema: { type: "object", properties: { from: { type: "string" } }, required: ["from"] } }],
      nameMap: new Map([["ekispert_api_search_course", "api_search_course"]]),
    }),
  };
});

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: Req) => {
        seen.push(structuredClone({ config: { thinkingConfig: req.config?.thinkingConfig, tools: req.config?.tools } }));
        if (seen.length <= rejectFirst) {
          throw Object.assign(new Error(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Request contains an invalid argument." } })), { name: "ApiError", status: 400 });
        }
        const call = {
          name: "submit_timeline",
          args: {
            summary: "ok",
            items: [
              { id: "out", kind: "prep", category: "transit-check", title: "行きの経路を確認", start: `${day}T09:00:00+09:00`, end: `${day}T09:15:00+09:00`, rationale: "r", requiresBooking: false },
              { id: "back", kind: "prep", category: "transit-check", title: "帰りの経路を確認", start: `${day}T21:30:00+09:00`, end: `${day}T21:45:00+09:00`, rationale: "r", requiresBooking: false },
            ],
          },
        };
        return { functionCalls: [{ id: "c0", ...call }], candidates: [{ content: { role: "model", parts: [{ functionCall: call }] } }] };
      }),
    };
  },
}));


const event = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: [] as never[], arriveEarlyForGoods: true,
};

const names = (r: Req) => (r.config?.tools?.[0].functionDeclarations ?? []).map((d) => d.name as string);

describe("プラン作成と乗り換え案内", () => {
  beforeEach(() => {
    seen.length = 0;
    rejectFirst = 0;
  });

  it("AI がリクエストを 1 回拒否しても、駅すぱあとの道具は従来の形式で残す（外すのは 2 回目から）", async () => {
    rejectFirst = 2;
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "ekispert-compat" });
    expect(out.plan.summary).toBe("ok");
    expect(names(seen[0])).toContain("ekispert_api_search_course");
    // 駅すぱあとが使えるときは、経路を調べない予備の道具を渡さない
    expect(names(seen[0])).not.toContain("estimate_travel_time");
    const level1 = seen[1].config?.tools?.[0].functionDeclarations?.find((d) => d.name === "ekispert_api_search_course");
    expect(level1).toMatchObject({ parameters: { type: "OBJECT", required: ["from"] } });
    expect(level1).not.toHaveProperty("parametersJsonSchema");
    expect(names(seen[2])).not.toContain("ekispert_api_search_course");
    // 駅すぱあとを外したら、予備の道具を渡す
    expect(names(seen[2])).toContain("estimate_travel_time");
  });

  it("経路を調べられなかった項目に、出発駅と到着駅を入れた検索リンクを付ける（帰りは逆向き）", async () => {
    const { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    const out = await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "ekispert-link" });
    const link = (id: string) => out.plan.items.find((i) => i.id === id)?.provider?.bookingUrl;
    expect(link("out")).toBe(transitSearchUrl("長崎", "ドーム前千代崎"));
    expect(link("back")).toBe(transitSearchUrl("ドーム前千代崎", "長崎"));
    expect(out.trace[0].summary).toContain("駅すぱあとで調べます");
  });
});

describe("駅すぱあとが断った理由のログ", () => {
  it("SDK の前置きを外し、キーの値を伏せる", async () => {
    vi.stubEnv("EKISPERT_API_KEY", "secret-key-123");
    vi.resetModules();
    const { failureReason } = await vi.importActual<typeof import("@/lib/services/ekispert")>("@/lib/services/ekispert");
    const e = Object.assign(new Error('Streamable HTTP error: Error POSTing to endpoint: {"error":"Unsupported protocol version","key":"secret-key-123"}'), { code: 400 });
    expect(failureReason(e)).toBe('{"error":"Unsupported protocol version","key":"[key]"}');
    vi.unstubAllEnvs();
  });
});

describe("乗り換えのフェールオーバー（主系 → 待機系）", () => {
  it("駅すぱあとの呼び出しが失敗したら、その場で所要時間の目安を fallback として返す", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0 };
    const out = await executeTool("ekispert_api_search_course", { from: "長崎" }, ctx);
    expect(out.ok).toBe(true);
    expect(out.summary).toContain("所要時間の目安に切り替えました");
    expect(out.response).toMatchObject({ fallback: { available: true, minutes: expect.any(Array), departBy: expect.any(String) } });
    expect(ctx).not.toHaveProperty("ekispertSucceeded", true);
  });

  it("帰りの検索（会場の駅が先・終演後の時刻）が失敗したら、帰りの目安を返す（往路の目安を渡さない）", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0 };
    const out = await executeTool("ekispert_api_search_course", { from: "ドーム前千代崎", to: "長崎", date: `${day}T21:30:00+09:00` }, ctx);
    expect(out.response).toMatchObject({ fallback: { direction: "帰り", from: "ドーム前千代崎", to: "長崎" } });
    expect((out.response as { fallback: { departBy?: string; summary: string } }).fallback.departBy).toBeUndefined();
    expect((out.response as { fallback: { summary: string } }).fallback.summary).toContain("ドーム前千代崎 → 長崎");
  });

  it("往路の検索で着きたい時刻が指定されていれば、その時刻に間に合う出発の目安を返す", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0 };
    const arrive = `${day}T14:00:00+09:00`;
    const out = await executeTool("ekispert_api_search_course", { from: "長崎", to: "ドーム前千代崎", arrival: arrive }, ctx);
    const fb = (out.response as { fallback: { direction: string; departBy: string; minutes: [number, number] } }).fallback;
    expect(fb.direction).toBe("往路");
    expect(Date.parse(arrive) - Date.parse(fb.departBy)).toBeGreaterThanOrEqual(fb.minutes[1] * 60_000);
  });

  it("Google マップの乗換検索のリンクは、出発駅・到着駅を入れて許可リストを通る", () => {
    const url = transitSearchUrl("長崎", "ドーム前千代崎");
    expect(url).toBe(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("長崎駅")}&destination=${encodeURIComponent("ドーム前千代崎駅")}&travelmode=transit`);
    expect(safeExternalUrl(url)).toBe(url);
  });
});

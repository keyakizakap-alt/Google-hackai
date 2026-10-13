import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google 検索（グラウンディング）で実在の店舗・宿・便を探す機能の確認。
 * - 検索は、プラン作成とは別の呼び出しで googleSearch だけを渡す
 * - 根拠のページがない答えは使わない
 * - 1 回のプラン作成で使える回数は 3 回まで
 * - 検索結果に書かれた名前・価格・便だけを通す（AI に作らせない）
 */
const requests: { config?: { tools?: Record<string, unknown>[] } }[] = [];
let grounded = true;

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (req: { config?: { tools?: Record<string, unknown>[] } }) => {
        requests.push(req);
        if (req.config?.tools?.[0]?.googleSearch) {
          return {
            text: "- 眉サロン ルミエール 長崎駅前店／長崎駅 徒歩3分／眉毛ワックス 5,500円\n- JAL 1840便／長崎空港 9:05 → 羽田空港 10:45／運賃 32,000円",
            candidates: [
              {
                groundingMetadata: grounded
                  ? {
                      groundingChunks: [{ web: { title: "example.jp", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" } }],
                      // 1 行目だけが出典に裏付けられている（2 行目は裏付けなし）
                      groundingSupports: [{ segment: { text: "- 眉サロン ルミエール 長崎駅前店／長崎駅 徒歩3分／眉毛ワックス 5,500円" }, groundingChunkIndices: [0] }],
                      searchEntryPoint: { renderedContent: "<div class=\"chip\">長崎駅 眉毛サロン</div>" },
                    }
                  : {},
              },
            ],
          };
        }
        const call = { name: "get_free_time_slots", args: {} };
        return { functionCalls: [{ id: "c0", ...call }], candidates: [{ content: { role: "model", parts: [{ functionCall: call }] } }] };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = "test-key";

const SOURCE = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const event = {
  id: "e1", artist: "LUMIRISE", title: "LUMIRISE 東京ドーム公演", venue: "東京ドーム", venueStation: "水道橋",
  startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: ["brow"] as ("brow")[], arriveEarlyForGoods: true,
};

beforeEach(() => {
  requests.length = 0;
  grounded = true;
  vi.resetModules();
  delete process.env.GEMINI_WEB_SEARCH;
});

describe("Google 検索の部品", () => {
  it("googleSearch だけを渡して検索し、出典と検索候補を返す", async () => {
    const { searchWeb } = await import("@/lib/services/webSearch");
    const r = await searchWeb("beauty_salon", "長崎駅 眉毛サロン");
    expect(requests[0].config?.tools).toEqual([{ googleSearch: {} }]);
    expect(r.available).toBe(true);
    expect(r.record?.sources[0].uri).toBe(SOURCE);
    expect(r.record?.suggestionsHtml).toContain("chip");
    // 照合に使うのは、出典に裏付けられた記述だけ
    expect(r.record?.claims).toEqual([{ text: "- 眉サロン ルミエール 長崎駅前店／長崎駅 徒歩3分／眉毛ワックス 5,500円", uris: [SOURCE] }]);
  });

  it("根拠のページがない答えは使わない", async () => {
    grounded = false;
    const { searchWeb } = await import("@/lib/services/webSearch");
    expect((await searchWeb("hotel", "東京ドーム ホテル")).available).toBe(false);
  });

  it("1 回のプラン作成で 3 回まで。4 回目は検索しない", async () => {
    const { executeTool } = await import("@/lib/agent/tools");
    const ctx = { event, busy: [], now: Date.now(), rejectedSubmissions: 0 };
    for (let i = 0; i < 3; i++) await executeTool("search_web", { purpose: "flight", query: "長崎空港 羽田空港" }, ctx);
    const fourth = await executeTool("search_web", { purpose: "flight", query: "長崎空港 羽田空港" }, ctx);
    expect(requests).toHaveLength(3);
    expect(fourth.response.available).toBe(false);
  });

  it("GEMINI_WEB_SEARCH=off なら AI に検索の道具を渡さない", async () => {
    const names = () => ((requests[0].config?.tools?.[0]?.functionDeclarations ?? []) as { name: string }[]).map((d) => d.name);
    let { runPlanningAgent } = await import("@/lib/agent/orchestrator");
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "on" }).catch(() => undefined);
    expect(names()).toContain("search_web");

    requests.length = 0;
    vi.resetModules();
    process.env.GEMINI_WEB_SEARCH = "off";
    ({ runPlanningAgent } = await import("@/lib/agent/orchestrator"));
    await runPlanningAgent({ event, busy: [], calendarSource: "demo", requestId: "off" }).catch(() => undefined);
    expect(names()).not.toContain("search_web");
  });
});

describe("検索で見つけたものの検査", () => {
  const SALON_SRC = SOURCE;
  const FLIGHT_SRC = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/flight";
  // 出典が裏付けている記述（groundingSupports）。本文には、裏付けのない「架空ホテル」の行も混ざっている想定
  const record = (src: string, supported: string[]) => ({ urls: new Set([src]), claims: supported.map((text) => ({ text, uris: [src] })) });
  const records = [
    record(SALON_SRC, ["- 眉サロン ルミエール 長崎駅前店／長崎駅 徒歩3分／眉毛ワックス 5,500円", "- ブロウスタジオ ソラ／浜町／7,700円"]),
    record(FLIGHT_SRC, ["- JAL 1840便／長崎空港 9:05 → 羽田空港 10:45／運賃 32,000円", "- ANA 664便／長崎空港 11:30 → 羽田空港 13:10／運賃 28,500円"]),
  ];
  const beauty = (provider: Record<string, unknown>) => ({
    id: "brow-1", kind: "beauty" as const, category: "brow", title: "眉毛サロン",
    start: `${day}T11:00:00+09:00`, end: `${day}T12:00:00+09:00`, rationale: "r", requiresBooking: true,
    provider: { name: "眉サロン ルミエール 長崎駅前店", sourceUrl: SALON_SRC, ...provider },
  });
  const leg = { line: "JAL 1840便", from: "長崎空港", to: "羽田空港", departure: `${day}T09:05:00+09:00`, arrival: `${day}T10:45:00+09:00` };
  const flight = (route: Record<string, unknown>) => ({
    id: "fly", kind: "transit" as const, category: "flight", title: "飛行機で東京へ",
    start: `${day}T09:05:00+09:00`, end: `${day}T10:45:00+09:00`, rationale: "r", requiresBooking: true,
    route: { from: "長崎空港", to: "羽田空港", summary: "JAL 1840便", source: "web" as const, sourceUrl: FLIGHT_SRC, legs: [leg], ...route },
  });
  const check = async (items: unknown[], withEvidence = true) => {
    const { validateTimeline } = await import("@/lib/agent/validate");
    return validateTimeline(items as never, event, [], Date.now(), undefined, withEvidence ? { records } : undefined).errors.join(" ");
  };

  it("検索結果にある店舗名・その店舗の価格・出典なら通す", async () => {
    expect(await check([beauty({ priceJpy: 5500 })])).not.toMatch(/検索結果|出典|実際の店舗/);
  });

  it("検索結果にない店舗名・価格や、検索していない出典は差し戻す", async () => {
    expect(await check([beauty({ name: "架空のサロン" })])).toContain("書かれていません");
    expect(await check([beauty({ priceJpy: 4800 })])).toContain("価格 4800 円");
    expect(await check([beauty({ sourceUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/zzz" })])).toContain("出典");
    expect(await check([beauty({})], false)).toContain("出典");
  });

  it("別の検索の出典や、同じ検索の別の店舗の価格を組み合わせたら差し戻す", async () => {
    // サロンの名前に、飛行機の検索の出典を付けた
    expect(await check([beauty({ sourceUrl: FLIGHT_SRC })])).toContain("書かれていません");
    // ルミエールに、ブロウスタジオ ソラの価格を付けた
    expect(await check([beauty({ priceJpy: 7700 })])).toContain("価格 7700 円");
  });

  it("本文にあっても、出典に裏付けられていない記述の店舗名は差し戻す", async () => {
    const { validateTimeline } = await import("@/lib/agent/validate");
    // 出典は返っているが、「架空サロン」の行を裏付けるものはない
    const evidence = { records: [{ urls: new Set([SALON_SRC]), claims: [] }] };
    const errors = validateTimeline([beauty({ name: "架空サロン" })] as never, event, [], Date.now(), undefined, evidence).errors.join(" ");
    expect(errors).toContain("書かれていません");
  });

  it("出典のない店舗名は今までどおり差し戻す", async () => {
    expect(await check([beauty({ sourceUrl: undefined })])).toContain("実際の店舗");
  });

  it("出典のない宿の価格は差し戻し、名前は予約サイトの案内に置き換える", async () => {
    const stay = { id: "hotel", kind: "stay" as const, title: "宿", start: `${day}T21:00:00+09:00`, end: `${day}T23:00:00+09:00`, rationale: "r", requiresBooking: true, provider: { name: "どこかのホテル", priceJpy: 9000 } };
    expect(await check([stay])).toContain("宿の価格");
    const { withoutUnsourcedNames } = await import("@/lib/agent/orchestrator");
    expect(withoutUnsourcedNames({ ...stay, provider: { name: "どこかのホテル" } }).provider?.name).toBe("予約サイトで宿と空室を確認");
    expect(withoutUnsourcedNames({ ...stay, provider: { name: "ホテル実在", sourceUrl: SALON_SRC } }).provider?.name).toBe("ホテル実在");
  });

  it("便は、同じ行の便名・空港・発着時刻・運賃がそろったものだけを通す", async () => {
    expect(await check([flight({ fareJpy: 32000 })])).not.toMatch(/検索結果|出典|便/);
    expect(await check([flight({ legs: [] })])).toContain("便（legs）がありません");
    expect(await check([flight({ legs: [{ ...leg, line: "ANA 999便" }] })])).toContain("ANA 999便");
    expect(await check([flight({ legs: [{ ...leg, to: "成田空港" }] })])).toContain("空港・発着時刻");
    expect(await check([flight({ legs: [{ ...leg, departure: `${day}T08:00:00+09:00` }] })])).toContain("空港・発着時刻");
    expect(await check([flight({ legs: [{ ...leg, departure: undefined }] })])).toContain("出発時刻");
    // JAL 1840便に、ANA 664便の運賃を付けた
    expect(await check([flight({ fareJpy: 28500 })])).toContain("運賃 28500 円");
  });

  it("価格の書き方の違い（5,500円・5500・1万2000）を同じものとして照合する", async () => {
    const { textMentionsPrice } = await import("@/lib/services/webSearchMatch");
    expect(textMentionsPrice("料金 5,500円", 5500)).toBe(true);
    expect(textMentionsPrice("料金 1万2000円", 12000)).toBe(true);
    expect(textMentionsPrice("料金 15,500円", 5500)).toBe(false);
  });
});

describe("検索の出典と航空券検索のリンク", () => {
  it("出典の転送用 URL と Google フライトは通し、それ以外の google のページは通さない", async () => {
    const { flightSearchUrl, safeExternalUrl } = await import("@/lib/safeUrl");
    expect(safeExternalUrl(SOURCE)).toBeDefined();
    expect(safeExternalUrl("https://vertexaisearch.cloud.google.com/other")).toBeUndefined();
    expect(safeExternalUrl(flightSearchUrl("長崎空港", "羽田空港", day))).toBeDefined();
    expect(safeExternalUrl("https://www.google.com/url?q=https://evil.example")).toBeUndefined();
  });
});

describe("飛行機の目安", () => {
  it("新幹線の区間（東京 → 広島）でも、飛行機の目安と空港を返す", async () => {
    const { estimateTravel } = await import("@/lib/services/travelEstimate");
    const e = estimateTravel({ from: "東京", to: "広島", arriveBy: `${day}T15:00:00+09:00` });
    expect(e.mode).toBe("新幹線");
    expect(e.alternatives?.[0].mode).toBe("飛行機");
    expect(e.alternatives?.[0].departBy).toBeDefined();
    expect(e.airports).toEqual({ from: "羽田空港", to: "広島空港" });
  });

  it("自前の空港がある県（長崎 → 東京ドーム）は、その県の空港を使う", async () => {
    const { estimateTravel } = await import("@/lib/services/travelEstimate");
    const e = estimateTravel({ from: "長崎", to: "水道橋", venue: "東京ドーム" });
    expect(e.mode).toBe("飛行機");
    expect(e.airports).toEqual({ from: "長崎空港", to: "羽田空港" });
  });

  it("近い区間（東京 → 名古屋）には飛行機を出さない", async () => {
    const { estimateTravel } = await import("@/lib/services/travelEstimate");
    const e = estimateTravel({ from: "東京", to: "名古屋" });
    expect(e.alternatives).toBeUndefined();
    expect(e.airports).toBeUndefined();
  });
});

describe("飛行機の移動とリンク", () => {
  it("「飛行機で」が主な手段の目安だけを飛行機とみなし、「飛行機は使わない」は含めない", async () => {
    const { isAirTravel } = await import("@/lib/agent/orchestrator");
    const base = { id: "t", kind: "transit" as const, title: "移動", start: `${day}T09:00:00+09:00`, end: `${day}T12:00:00+09:00`, rationale: "r", requiresBooking: false };
    const route = (summary: string) => ({ ...base, route: { from: "長崎", to: "水道橋", summary, legs: [], source: "estimate" as const } });
    expect(isAirTravel(route("長崎 → 水道橋：飛行機で約 4 時間（目安）"))).toBe(true);
    expect(isAirTravel(route("新幹線で移動（飛行機は使わない）"))).toBe(false);
  });

  it("日本語の空港名が長くても、Google フライトのリンクはプランに保存できる", async () => {
    const { flightSearchUrl } = await import("@/lib/safeUrl");
    const { TimelineItemSchema } = await import("@/lib/agent/types");
    const url = flightSearchUrl("東京国際空港（羽田空港）第2ターミナル", "JR長崎駅 → 京セラドーム大阪 最寄りの空港", day);
    expect(url.length).toBeGreaterThan(300);
    const item = { id: "f", kind: "transit", title: "飛行機", start: `${day}T09:00:00+09:00`, end: `${day}T11:00:00+09:00`, rationale: "r", requiresBooking: true, provider: { name: "Google フライトで空席と運賃を確認", bookingUrl: url } };
    expect(TimelineItemSchema.safeParse(item).success).toBe(true);
  });
});


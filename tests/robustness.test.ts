import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 本番で起きうる失敗への備え（コードの見直しで見つかったもの）。
 * - 読み取った長い会場名・駅名で、保存もプラン作成も通らなくなる
 * - AI に見えない文字数の上限で提出が差し戻され、時間切れになる
 * - 自動で足す確認項目で、プランの項目が上限（20 件）を超えて保存に失敗する
 * - Google カレンダーの取得が止まる・混み合う・予定が多すぎるときに、取り込みやプラン作成が丸ごと失敗する
 */
const day = new Date(Date.now() + 20 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("読み取った値の長さ", () => {
  it("場所欄に住所まで入った会場でも、イベントの上限の長さに切りそろえる", async () => {
    const { extractByRules } = await import("@/lib/eventDetection/detect");
    const { OshiEventSchema } = await import("@/lib/agent/types");
    const location = "Zepp DiverCity(TOKYO) 東京都江東区青海1-1-10 ダイバーシティ東京プラザ 2階 イベントホール入口はこちら";
    const d = extractByRules({ key: "k", summary: "LUMIRISE ワンマンライブ", location, startAt: `${day}T18:00:00+09:00`, timeUnknown: false });
    expect(d.venue.length).toBeLessThanOrEqual(60);
    expect(d.venueStation.length).toBeLessThanOrEqual(40);
    const event = { id: "cal-1", artist: d.artist, title: d.title, venue: d.venue, venueStation: d.venueStation, startAt: d.startAt, homeStation: "東京", beautyServices: [], arriveEarlyForGoods: true, source: "calendar" };
    expect(OshiEventSchema.safeParse(event).success).toBe(true);
  });
});

describe("提出の文字数", () => {
  it("ライブ本体の項目に 80 文字の公演名を入れても、差し戻さずに切って受け付ける", async () => {
    const { clampSubmission } = await import("@/lib/agent/tools");
    const longTitle = "あ".repeat(80);
    const out = clampSubmission({
      summary: "s",
      items: [{ id: "ev", kind: "event", title: longTitle, start: `${day}T18:00:00+09:00`, end: `${day}T21:00:00+09:00`, rationale: "い".repeat(400), requiresBooking: false }],
      warnings: Array.from({ length: 12 }, () => "う".repeat(250)),
    }) as { items: { title: string; rationale: string }[]; warnings: string[] };
    expect(out.items[0].title).toHaveLength(60);
    expect(out.items[0].rationale).toHaveLength(300);
    expect(out.warnings).toHaveLength(10);
    expect(out.warnings[0]).toHaveLength(200);
  });

  it("形の違う値はそのまま残し、検査（SubmitSchema）に任せる", async () => {
    const { clampSubmission } = await import("@/lib/agent/tools");
    expect(clampSubmission({ items: "x", summary: 3 })).toEqual({ items: "x", summary: 3 });
  });
});

describe("プランの項目数", () => {
  it("上限（20 件）を超えたら、準備の項目の後ろから外し、ライブ本体と移動は残す", async () => {
    const { capItems } = await import("@/lib/agent/orchestrator");
    const items = [
      { id: "ev", kind: "event" },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, kind: "transit" })),
      ...Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, kind: "prep" })),
    ];
    const out = capItems(items);
    expect(out).toHaveLength(20);
    expect(out.some((i) => i.id === "ev")).toBe(true);
    expect(out.filter((i) => i.kind === "transit")).toHaveLength(6);
    expect(out.some((i) => i.id === "p15")).toBe(false);
    expect(out.some((i) => i.id === "p0")).toBe(true);
  });
});

describe("Google カレンダーの取得", () => {
  const opts = { accessToken: "t", from: Date.now(), to: Date.now() + 86_400_000, fields: "items", maxPages: 2, logEvent: "test.calendar" };

  it("予定が多くて上限のページを超えても失敗にせず、集めた分を返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "a" }], nextPageToken: "next" }))));
    const { listEventPages } = await import("@/lib/google/calendar");
    await expect(listEventPages(opts)).resolves.toHaveLength(2);
  });

  it("回数の制限（403 rateLimitExceeded）は、認証の失敗ではなく混み合いとして扱う", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), { status: 403 })));
    const { listEventPages } = await import("@/lib/google/calendar");
    await expect(listEventPages(opts)).rejects.toMatchObject({ name: "CalendarBusyError" });
  });

  it("権限の拒否（403 forbidden）は、今までどおり再連携をお願いする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { errors: [{ reason: "forbidden" }] } }), { status: 403 })));
    const { listEventPages, CalendarAuthError } = await import("@/lib/google/calendar");
    await expect(listEventPages(opts)).rejects.toBeInstanceOf(CalendarAuthError);
  });

  it("応答がないときは待ち続けず、混み合いとして返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }));
    const { listEventPages } = await import("@/lib/google/calendar");
    await expect(listEventPages(opts)).rejects.toMatchObject({ name: "CalendarBusyError" });
  });

  it("混み合いは 503 で返し、利用者には時間をおいて試すよう伝える", async () => {
    const { CalendarBusyError } = await import("@/lib/google/calendar");
    const { errorResponse } = await import("@/lib/http");
    const res = errorResponse(new CalendarBusyError(429), { requestId: "r", route: "t" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("少し時間をおいて");
  });
});

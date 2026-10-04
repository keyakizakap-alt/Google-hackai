import { describe, expect, it, vi } from "vitest";
import { gateForDetection, sanitizeBusy } from "@/lib/sources/gate";

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("共通の安全チェック（gate）", () => {
  it("空き時間は時間帯以外の項目を捨てて作り直す", () => {
    const leaky = [{ start: future(1), end: future(1.1), allDay: false, label: "予定あり", summary: "病院", location: "東京" } as never];
    const out = sanitizeBusy(leaky);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(["allDay", "end", "label", "start"]);
    expect(JSON.stringify(out)).not.toMatch(/病院|東京/);
  });

  it("壊れた時間帯は捨てる", () => {
    expect(sanitizeBusy([{ start: "x", end: "y", allDay: false, label: "予定あり" }])).toEqual([]);
  });

  it("ライブ以外の予定は候補に残らず、元の配列も空にする", () => {
    const items = [
      { id: "a", summary: "IVE 京セラドーム公演", start: { dateTime: future(20) } },
      { id: "b", summary: "歯医者", start: { dateTime: future(2) } },
    ];
    const r = gateForDetection(items);
    expect(r.scanned).toBe(2);
    expect(r.candidates.map((c) => c.summary)).toEqual(["IVE 京セラドーム公演"]);
    expect(items).toHaveLength(0);
  });
});

describe("秘密の値の入れ替え（SESSION_SECRET / SESSION_SECRET_PREVIOUS）", () => {
  it("古い値で作った署名・暗号は、入れ替え後も読める。新しい値で作り直される", async () => {
    vi.resetModules();
    process.env.SESSION_SECRET = "old-secret-0123456789-abcdefghijklmnop";
    delete process.env.SESSION_SECRET_PREVIOUS;
    const oldCrypto = await import("@/lib/crypto");
    const sealed = oldCrypto.seal("hello", "session");
    const sig = oldCrypto.hmac("data", "plan");

    vi.resetModules();
    process.env.SESSION_SECRET = "new-secret-0123456789-abcdefghijklmnop";
    process.env.SESSION_SECRET_PREVIOUS = "old-secret-0123456789-abcdefghijklmnop";
    const rotated = await import("@/lib/crypto");
    expect(rotated.unseal(sealed, "session")).toBe("hello");
    expect(rotated.verifyHmac("data", sig, "plan")).toBe(true);
    expect(rotated.hmac("data", "plan")).not.toBe(sig);

    vi.resetModules();
    delete process.env.SESSION_SECRET_PREVIOUS;
    const afterGrace = await import("@/lib/crypto");
    expect(afterGrace.unseal(sealed, "session")).toBeNull();
    expect(afterGrace.verifyHmac("data", sig, "plan")).toBe(false);
    delete process.env.SESSION_SECRET;
  });
});

describe("デモのカレンダー（sample）", () => {
  it("DEMO_CALENDAR_ID を設定したときだけ連携先に現れる", async () => {
    vi.resetModules();
    delete process.env.DEMO_CALENDAR_ID;
    delete process.env.CALENDAR_SOURCES;
    expect((await import("@/lib/sources")).enabledSources().map((s) => s.id)).not.toContain("sample");

    vi.resetModules();
    process.env.DEMO_CALENDAR_ID = "oshiready.demo@example.com";
    expect((await import("@/lib/sources")).enabledSources().map((s) => s.id)).toContain("sample");

    vi.resetModules();
    process.env.CALENDAR_SOURCES = "google";
    expect((await import("@/lib/sources")).enabledSources().map((s) => s.id)).not.toContain("sample");
    delete process.env.DEMO_CALENDAR_ID;
    delete process.env.CALENDAR_SOURCES;
  });

  it("指定したカレンダー ID を URL エンコードして読み、失敗は認証エラーとして扱う", async () => {
    vi.resetModules();
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { listEventPages, CalendarAuthError } = await import("@/lib/google/calendar");
    await expect(
      listEventPages({ accessToken: "t", calendarId: "demo@example.com", from: 0, to: 1, fields: "items(start)", maxPages: 1, logEvent: "test" }),
    ).rejects.toBeInstanceOf(CalendarAuthError);
    expect(calls[0]).toContain("/calendars/demo%40example.com/events?");
    expect(calls[0]).toContain("fields=items%28start%29");
    vi.unstubAllGlobals();
  });
});

describe("プランと新しい予定の重なり", () => {
  it("重なった項目だけを返し、プラン自身・終日の予定は数えない", async () => {
    const { findConflicts } = await import("@/lib/agent/conflicts");
    const items = [
      { id: "a", start: "2030-10-28T10:00:00+09:00", end: "2030-10-28T11:00:00+09:00" },
      { id: "b", start: "2030-10-29T10:00:00+09:00", end: "2030-10-29T11:00:00+09:00" },
      { id: "c", start: "2030-10-30T10:00:00+09:00", end: "2030-10-30T11:00:00+09:00" },
    ];
    const busy = [
      { start: "2030-10-28T10:30:00+09:00", end: "2030-10-28T12:00:00+09:00", allDay: false, label: "予定あり" as const },
      { start: "2030-10-29T10:00:00+09:00", end: "2030-10-29T11:00:00+09:00", allDay: false, label: "予定あり" as const },
      { start: "2030-10-30T00:00:00+09:00", end: "2030-10-31T00:00:00+09:00", allDay: true, label: "予定あり" as const },
    ];
    expect(findConflicts(items, busy)).toEqual(["a"]);
  });
});

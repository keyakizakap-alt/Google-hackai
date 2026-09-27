import { describe, expect, it } from "vitest";
import { maskEvents, redactText } from "@/lib/privacy/mask";

describe("maskEvents", () => {
  it("drops titles, descriptions, locations and attendees", () => {
    const out = maskEvents([
      {
        start: { dateTime: "2026-10-20T10:00:00+09:00" },
        end: { dateTime: "2026-10-20T11:00:00+09:00" },
        summary: "病院（皮膚科）",
        description: "診察券番号 1234",
        location: "東京都千代田区",
        attendees: [{ email: "a@example.com" }],
      },
    ]);
    expect(out).toEqual([{ start: "2026-10-20T10:00:00+09:00", end: "2026-10-20T11:00:00+09:00", allDay: false, label: "予定あり" }]);
    expect(JSON.stringify(out)).not.toMatch(/病院|診察|千代田|example/);
  });

  it("skips cancelled / transparent / birthday events and handles all-day", () => {
    const out = maskEvents([
      { status: "cancelled", start: { dateTime: "2026-10-20T10:00:00Z" }, end: { dateTime: "2026-10-20T11:00:00Z" } },
      { transparency: "transparent", start: { dateTime: "2026-10-20T10:00:00Z" }, end: { dateTime: "2026-10-20T11:00:00Z" } },
      { eventType: "birthday", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } },
      { start: { date: "2026-10-23" }, end: { date: "2026-10-24" } },
    ]);
    expect(out).toEqual([{ start: "2026-10-23T00:00:00+09:00", end: "2026-10-24T00:00:00+09:00", allDay: true, label: "予定あり" }]);
  });
});

describe("redactText", () => {
  it("masks contact info and card numbers", () => {
    const s = redactText("連絡は foo@bar.com か 090-1234-5678、カード 4111 1111 1111 1111 https://x.y/z");
    expect(s).not.toMatch(/foo@bar|090-1234|4111|https/);
    expect(s).toContain("[メール]");
  });
});

import { describe, expect, it } from "vitest";
import { buildIcs, buildReminders, dueReminders, planToCalendar, upcomingReminders } from "@/lib/reminders";

const event = {
  id: "e1", artist: "IVE", title: "IVE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
  startAt: "2030-10-30T18:00:00+09:00", homeStation: "長崎", beautyServices: ["brow" as const], arriveEarlyForGoods: true,
};

describe("リマインド", () => {
  it("公演の前日 20 時・出発 1 時間前、予約の前日と 2 時間前、未予約は 3 日前に知らせる", () => {
    const list = buildReminders({
      event,
      planItems: [{ id: "t", kind: "transit", title: "長崎駅 出発", start: "2030-10-30T12:00:00+09:00", end: "2030-10-30T16:00:00+09:00", rationale: "r", requiresBooking: true }],
      reservations: [
        { id: "r1", title: "眉毛サロン", start: "2030-10-28T10:00:00+09:00", status: "reserved", confirmationNo: "DEMO-BT-1" },
        { id: "r2", title: "新幹線", start: "2030-10-30T12:00:00+09:00", status: "todo" },
        { id: "r3", title: "取り消し済み", start: "2030-10-29T10:00:00+09:00", status: "cancelled" },
      ],
    });
    const byId = Object.fromEntries(list.map((r) => [r.id, r.at]));
    expect(byId["live-eve:e1"]).toBe(new Date("2030-10-29T20:00:00+09:00").toISOString());
    expect(byId["live-go:e1"]).toBe(new Date("2030-10-30T11:00:00+09:00").toISOString());
    expect(byId["res-eve:r1"]).toBe(new Date("2030-10-27T20:00:00+09:00").toISOString());
    expect(byId["res-2h:r1"]).toBe(new Date("2030-10-28T08:00:00+09:00").toISOString());
    expect(byId["todo:r2"]).toBe(new Date("2030-10-27T12:00:00+09:00").toISOString());
    expect(list.some((r) => r.id.includes("r3"))).toBe(false);
    // 時刻順
    expect(list.map((r) => Date.parse(r.at))).toEqual([...list.map((r) => Date.parse(r.at))].sort((a, b) => a - b));
  });

  it("過ぎたものは一覧から外し、通知は直近 15 分以内の未通知分だけ", () => {
    const list = buildReminders({ event });
    const eve = Date.parse("2030-10-29T20:00:00+09:00");
    expect(upcomingReminders(list, eve + 60 * 60_000).map((r) => r.id)).toEqual(["live-go:e1"]);
    expect(dueReminders(list, eve + 60_000, new Set()).map((r) => r.id)).toEqual(["live-eve:e1"]);
    expect(dueReminders(list, eve + 60_000, new Set(["live-eve:e1"]))).toEqual([]);
    expect(dueReminders(list, eve + 60 * 60_000, new Set())).toEqual([]);
  });

  it("カレンダー用ファイルにアラームを入れ、特殊文字をエスケープし、長い行を折り返す", () => {
    const ics = buildIcs(
      planToCalendar(event, [
        { id: "b", kind: "beauty", title: "眉毛サロン, 表参道; 予約", start: "2030-10-28T10:00:00+09:00", end: "2030-10-28T11:00:00+09:00", rationale: "理由".repeat(40), requiresBooking: true },
      ], { b: "DEMO-BT-1" }),
      new Date("2030-01-01T00:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20301028T010000Z");
    expect(ics).toContain("SUMMARY:眉毛サロン\\, 表参道\; 予約");
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics).toMatch(/DESCRIPTION:予約番号: DEMO-BT-1\\n/);
    // 公演本体も入る（プランに event 項目がなくても）
    expect(ics).toContain("SUMMARY:IVE｜IVE 京セラドーム公演");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("確認項目のリマインド", () => {
  it("経路の確認などは「まだ確認していません」と知らせる", () => {
    const [r] = buildReminders({ event: null, reservations: [{ id: "x", title: "経路", start: "2030-10-30T12:00:00+09:00", status: "todo", kind: "prep" }] });
    expect(r.title).toBe("まだ確認していません：経路");
  });
});

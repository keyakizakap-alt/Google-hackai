import { describe, expect, it } from "vitest";
import { mergeCalendarEvents } from "@/lib/client/calendarSync";
import { pickLiveCandidates, type DetectedLiveEvent } from "@/lib/eventDetection/detect";
import type { OshiEvent } from "@/lib/agent/types";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const profile = { homeStation: "新宿", beautyServices: [] as OshiEvent["beautyServices"], arriveEarlyForGoods: true };
const detected = (key: string, startAt: string, extra: Partial<DetectedLiveEvent> = {}): DetectedLiveEvent => ({
  key, artist: "MIRAGE NOTE", title: "MIRAGE NOTE 公演", venue: "日本武道館", venueStation: "九段下", startAt, timeUnknown: false, confidence: "high", source: "rules", ...extra,
});

describe("カレンダーの予定 ID からライブを見分ける", () => {
  it("同じ予定の日時が変わっても、同じキーになる", () => {
    const base = { id: "abc123", summary: "MIRAGE NOTE 公演", location: "日本武道館", status: "confirmed" };
    const [a] = pickLiveCandidates([{ ...base, start: { dateTime: `${day(30)}T18:00:00+09:00` } }]);
    const [b] = pickLiveCandidates([{ ...base, start: { dateTime: `${day(40)}T17:00:00+09:00` } }]);
    expect(a.key).toBe(b.key);
  });
});

describe("mergeCalendarEvents", () => {
  const start1 = `${day(30)}T18:00:00+09:00`;
  const start2 = `${day(31)}T17:00:00+09:00`;

  it("新しいライブを追加し、利用者の設定（出発駅など）を入れる", () => {
    const r = mergeCalendarEvents([], [detected("k1", start1)], [], profile);
    expect(r.added).toBe(1);
    expect(r.events[0]).toMatchObject({ id: "cal-k1", homeStation: "新宿", source: "calendar" });
  });

  it("取り込み済みのライブの日時が変わったら更新し、利用者が決めた内容は残す", () => {
    const current: OshiEvent[] = [{ ...mergeCalendarEvents([], [detected("k1", start1)], [], profile).events[0], homeStation: "長崎", beautyServices: ["hair"] }];
    const r = mergeCalendarEvents(current, [detected("k1", start2)], [], profile);
    expect(r.added).toBe(0);
    expect(r.updated).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ startAt: start2, homeStation: "長崎", beautyServices: ["hair"] });
  });

  it("ライブ名や会場名の表記が揺れただけでは、更新扱いにしない（プランを作り直さない）", () => {
    const current = mergeCalendarEvents([], [detected("k1", start1)], [], profile).events;
    const r = mergeCalendarEvents(current, [detected("k1", start1, { title: "MIRAGE NOTE LIVE 公演", venue: "武道館" })], [], profile);
    expect(r.updated).toHaveLength(0);
    expect(r.events[0].title).toBe("MIRAGE NOTE 公演");
  });

  it("削除したライブは復活させず、古い版で取り込んだ同じライブは重複して追加しない", () => {
    expect(mergeCalendarEvents([], [detected("k1", start1)], ["cal-k1"], profile).added).toBe(0);
    const old: OshiEvent = { ...mergeCalendarEvents([], [detected("oldkey", start1)], [], profile).events[0] };
    const r = mergeCalendarEvents([old], [detected("k1", start1)], [], profile);
    expect(r.added).toBe(0);
    expect(r.events).toHaveLength(1);
  });
});

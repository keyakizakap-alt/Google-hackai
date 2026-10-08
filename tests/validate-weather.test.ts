import { describe, expect, it } from "vitest";
import { validateTimeline } from "@/lib/agent/validate";
import type { OshiEvent, TimelineItem } from "@/lib/agent/types";
import type { BusyBlock } from "@/lib/privacy/mask";

const EVENT_START = "2026-10-27T18:00:00+09:00";
const NOW = Date.parse("2026-10-20T10:00:00+09:00");

const event: OshiEvent = {
  id: "e1",
  artist: "推し",
  title: "ライブ",
  venue: "京セラドーム大阪",
  venueStation: "ドーム前千代崎",
  startAt: EVENT_START,
  homeStation: "大阪",
  beautyServices: [],
  arriveEarlyForGoods: true,
};

const item = (o: Partial<TimelineItem> & Pick<TimelineItem, "id" | "kind" | "start" | "end">): TimelineItem =>
  ({ title: "項目", rationale: "理由", requiresBooking: false, ...o }) as TimelineItem;

/** 経路の確認項目。これが無いと別のエラーが出るため、どのケースにも入れる */
const transitCheck = item({
  id: "t1", kind: "prep", category: "transit-check",
  start: "2026-10-26T10:00:00+09:00", end: "2026-10-26T10:30:00+09:00",
});

const rain = { sky: "rain", needsRainGear: true };

describe("雨・雪の予報をプランへ反映させる", () => {
  it("濡れ対策に触れていなければ差し戻す", () => {
    const { errors } = validateTimeline([transitCheck], event, [], NOW, rain);
    expect(errors.some((e) => e.includes("濡れ対策"))).toBe(true);
  });

  it("持ち物に触れていれば通る", () => {
    const items = [transitCheck, item({
      id: "p1", kind: "prep", title: "持ち物の確認（折りたたみ傘）",
      start: "2026-10-26T20:00:00+09:00", end: "2026-10-26T20:15:00+09:00",
    })];
    const { errors } = validateTimeline(items, event, [], NOW, rain);
    expect(errors.some((e) => e.includes("濡れ対策"))).toBe(false);
  });

  it("理由の文章で触れていても通る", () => {
    const items = [transitCheck, item({
      id: "p1", kind: "prep", title: "ヘアセット",
      rationale: "雨予報のため当日朝に寄せ、崩れを防ぐ",
      start: "2026-10-27T09:00:00+09:00", end: "2026-10-27T10:00:00+09:00",
    })];
    expect(validateTimeline(items, event, [], NOW, rain).errors.some((e) => e.includes("濡れ対策"))).toBe(false);
  });

  it("天気を調べていなければ要求しない（予報が無い日は断定させない）", () => {
    const { errors } = validateTimeline([transitCheck], event, [], NOW, undefined);
    expect(errors.some((e) => e.includes("濡れ対策"))).toBe(false);
  });

  it("晴れなら要求しない", () => {
    const { errors } = validateTimeline([transitCheck], event, [], NOW, { sky: "clear", needsRainGear: false });
    expect(errors.some((e) => e.includes("濡れ対策"))).toBe(false);
  });
});

describe("立ち寄り先（kind=spot）の検証", () => {
  const spot = (start: string, end: string, extra: Partial<TimelineItem> = {}) =>
    item({ id: "s1", kind: "spot", category: "gourmet", title: "ご当地グルメ", start, end, ...extra });

  it("開演 60 分前までに終わらなければ差し戻す", () => {
    const items = [transitCheck, spot("2026-10-27T16:30:00+09:00", "2026-10-27T17:30:00+09:00")];
    const { errors } = validateTimeline(items, event, [], NOW);
    expect(errors.some((e) => e.includes("開演 60 分前"))).toBe(true);
  });

  it("余裕があれば通る", () => {
    const items = [transitCheck, spot("2026-10-27T14:00:00+09:00", "2026-10-27T15:00:00+09:00")];
    const { errors } = validateTimeline(items, event, [], NOW);
    expect(errors.some((e) => e.includes("開演 60 分前"))).toBe(false);
  });

  it("カレンダーの既存予定と重なれば差し戻す", () => {
    const busy: BusyBlock[] = [
      { start: "2026-10-27T14:00:00+09:00", end: "2026-10-27T15:00:00+09:00", allDay: false, label: "予定あり" },
    ];
    const items = [transitCheck, spot("2026-10-27T14:30:00+09:00", "2026-10-27T15:30:00+09:00")];
    const { errors } = validateTimeline(items, event, busy, NOW);
    expect(errors.some((e) => e.includes("既存予定"))).toBe(true);
  });

  it("価格や予約枠を書いたら差し戻す（取得していない情報を出させない）", () => {
    const items = [transitCheck, spot("2026-10-27T13:00:00+09:00", "2026-10-27T14:00:00+09:00", {
      provider: { name: "お店", priceJpy: 1200 },
    })];
    const { errors } = validateTimeline(items, event, [], NOW);
    expect(errors.some((e) => e.includes("価格"))).toBe(true);
  });

  it("雨のとき屋外の写真スポットは警告する（エラーにはしない）", () => {
    const items = [transitCheck, spot("2026-10-27T13:00:00+09:00", "2026-10-27T14:00:00+09:00", {
      category: "photo", title: "夜景スポット", rationale: "雨具を持参する",
    })];
    const { warnings } = validateTimeline(items, event, [], NOW, rain);
    expect(warnings.some((w) => w.includes("屋内の候補"))).toBe(true);
  });
});

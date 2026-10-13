import { describe, expect, it } from "vitest";
import { estimateTravel, prefectureOf } from "@/lib/services/travelEstimate";
import { safeExternalUrl } from "@/lib/safeUrl";
import { validateTimeline } from "@/lib/agent/validate";
import type { OshiEvent, TimelineItem } from "@/lib/agent/types";
import { MS_DAY, MS_MIN } from "@/lib/time";

/** 乗り換えの待機系（API を使わない所要時間の目安）の確認 */
describe("所要時間の目安", () => {
  const arriveBy = "2026-12-19T15:00:00+09:00";

  it("遠征（長崎 → 京セラドーム大阪）は拠点を経由した幅で返し、出発の目安を逆算する", () => {
    const e = estimateTravel({ from: "長崎", to: "ドーム前千代崎", venue: "京セラドーム大阪", arriveBy });
    expect(e.available).toBe(true);
    const [min, max] = e.minutes!;
    expect(min).toBeGreaterThanOrEqual(240);
    expect(max).toBeGreaterThan(min);
    expect(e.summary).toContain("目安");
    // 遅い方の見積もりで間に合うように出発する
    expect(Date.parse(arriveBy) - Date.parse(e.departBy!)).toBeGreaterThanOrEqual(max * MS_MIN);
  });

  it("同じ都県の中（東京 → 東京ドーム）は短い移動として返す", () => {
    const e = estimateTravel({ from: "新宿", to: "水道橋", venue: "東京ドーム", arriveBy });
    expect(e.available).toBe(true);
    expect(e.minutes![1]).toBeLessThanOrEqual(90);
    expect(e.mode).toBe("在来線・地下鉄");
  });

  it("飛行機の区間（札幌 → 福岡）も目安を返す", () => {
    const e = estimateTravel({ from: "札幌駅", to: "唐人町", venue: "みずほPayPayドーム福岡", arriveBy });
    expect(e.available).toBe(true);
    expect(e.mode).toBe("飛行機");
  });

  it("地域が分からない出発駅は、目安を出さない（作らない）", () => {
    const e = estimateTravel({ from: "どこでもない駅", to: "水道橋", venue: "東京ドーム", arriveBy });
    expect(e.available).toBe(false);
    expect(e.minutes).toBeUndefined();
  });

  it("出発駅は駅名・市名・都道府県名・前後の文字付きでも都道府県を判定する", () => {
    expect(prefectureOf("博多")).toBe("福岡");
    expect(prefectureOf("博多駅")).toBe("福岡");
    expect(prefectureOf("JR博多駅前")).toBe("福岡");
    expect(prefectureOf("長崎県")).toBe("長崎");
    expect(prefectureOf("京都")).toBe("京都");
    expect(prefectureOf("京都府")).toBe("京都");
    expect(prefectureOf("東京都")).toBe("東京");
    expect(prefectureOf("")).toBeUndefined();
  });
});

describe("Google マップの乗換検索リンクの許可", () => {
  it("/maps/dir/ だけを通し、google.com の転送リンクは通さない", () => {
    expect(safeExternalUrl("https://www.google.com/maps/dir/?api=1&origin=a&destination=b&travelmode=transit")).toBeDefined();
    expect(safeExternalUrl("https://www.google.com/url?q=https://evil.example")).toBeUndefined();
    expect(safeExternalUrl("https://www.google.com/search?q=x")).toBeUndefined();
  });
});

describe("目安で組んだ移動の検査", () => {
  const day = new Date(Date.now() + 20 * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
  const event: OshiEvent = {
    id: "e1", artist: "LUMIRISE", title: "LUMIRISE 公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
    startAt: `${day}T18:00:00+09:00`, homeStation: "長崎", beautyServices: [], arriveEarlyForGoods: true,
  };
  const go = (route: Partial<NonNullable<TimelineItem["route"]>>): TimelineItem => ({
    id: "go", kind: "transit", title: "会場へ移動", start: `${day}T09:00:00+09:00`, end: `${day}T15:00:00+09:00`,
    route: { from: "長崎", to: "ドーム前千代崎", summary: "新幹線で約 5 時間（目安）", legs: [], source: "estimate", ...route },
    rationale: "r", requiresBooking: true,
  });

  it("目安の要約だけなら通す", () => {
    expect(validateTimeline([go({})], event, [], Date.now()).errors).toEqual([]);
  });

  it("目安なのに列車や運賃を書いていたら差し戻す", () => {
    const withLeg = go({ legs: [{ line: "のぞみ", from: "博多", to: "新大阪", departure: `${day}T10:00:00+09:00`, arrival: `${day}T12:30:00+09:00` }] });
    expect(validateTimeline([withLeg], event, [], Date.now()).errors.join(" ")).toContain("列車（legs）や運賃");
    expect(validateTimeline([go({ fareJpy: 19000 })], event, [], Date.now()).errors.join(" ")).toContain("列車（legs）や運賃");
  });
});

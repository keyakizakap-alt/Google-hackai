import { describe, expect, it } from "vitest";
import { extractByRules, isLiveCandidate, pickLiveCandidates } from "@/lib/eventDetection/detect";
import { demoCalendarItems } from "@/lib/demo/calendar";

const future = (days: number, time = "18:00:00") => new Date(Date.now() + days * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10) + `T${time}+09:00`;

describe("live event detection", () => {
  it("keeps only live-like events and drops everything else", () => {
    const items = [
      { id: "a", summary: "LUMIRISE 京セラドーム公演", location: "京セラドーム大阪", start: { dateTime: future(30) } },
      { id: "b", summary: "歯医者", location: "〇〇歯科", start: { dateTime: future(3, "10:00:00") } },
      { id: "c", summary: "定例会議 tour of office", start: { dateTime: future(4, "10:00:00") } },
      { id: "d", summary: "友達とランチ", start: { dateTime: future(5, "12:00:00") } },
    ];
    const c = pickLiveCandidates(items);
    expect(c).toHaveLength(1);
    expect(c[0].summary).toBe("LUMIRISE 京セラドーム公演");
    expect(JSON.stringify(c)).not.toMatch(/歯医者|会議|ランチ/);
  });

  it("drops past and cancelled events, marks all-day as time-unknown", () => {
    const c = pickLiveCandidates([
      { id: "p", summary: "LUMIRISE LIVE", start: { dateTime: "2020-01-01T18:00:00+09:00" } },
      { id: "x", summary: "LUMIRISE LIVE", status: "cancelled", start: { dateTime: future(10) } },
      { id: "y", summary: "ASTRONOVA TOUR 東京ドーム", start: { date: future(20).slice(0, 10) } },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].timeUnknown).toBe(true);
    expect(c[0].startAt).toMatch(/T18:00:00\+09:00$/);
  });

  it("masks contact info inside candidate text", () => {
    const c = pickLiveCandidates([{ id: "m", summary: "LUMIRISE LIVE 連絡 foo@bar.com", start: { dateTime: future(10) } }]);
    expect(c[0].summary).not.toContain("foo@bar.com");
  });

  it("extracts artist / venue / station by rules", () => {
    const [a, b, c] = pickLiveCandidates(demoCalendarItems(Date.now())).map(extractByRules);
    expect(a).toMatchObject({ artist: "LUMIRISE", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎", confidence: "high" });
    expect(b).toMatchObject({ artist: "SOLA FLARE", venue: "横浜アリーナ", venueStation: "新横浜" });
    expect(b.title).toBe("SOLA FLARE FAN MEETING");
    expect(c).toMatchObject({ artist: "ASTRONOVA", venue: "東京ドーム", venueStation: "水道橋" });
  });

  it("does not treat salon appointments as lives", () => {
    expect(isLiveCandidate({ summary: "ネイルサロン（ライブ前）", start: { dateTime: future(3) } })).toBe(false);
  });
});

describe("venue dictionary", () => {
  it("prefers the longest venue name", async () => {
    const { matchVenue } = await import("@/lib/eventDetection/venues");
    expect(matchVenue("東京ドームシティホール")?.station).toBe("水道橋");
    expect(matchVenue("東京ドームシティホール")?.name).toBe("東京ドームシティホール");
    expect(matchVenue("Kアリーナ横浜")?.station).toBe("新高島");
    expect(matchVenue("GLION ARENA KOBE")?.station).toBe("三宮");
    expect(matchVenue("SOLA FLARE FAN MEETING")).toBeNull();
  });
});

describe("parseEventsFromText (貼り付けた文章から読み取り)", () => {
  it("reads a ticket email", async () => {
    const { parseEventsFromText } = await import("@/lib/eventDetection/parseText");
    const now = Date.parse("2026-09-27T12:00:00+09:00");
    const text = `【当選のお知らせ】
公演名：LUMIRISE THE 2ND WORLD TOUR in JAPAN
日時：2026年10月30日（金） 開場16:30 / 開演18:00
会場：京セラドーム大阪
お問い合わせ support@example.com`;
    const [e] = parseEventsFromText(text, now);
    expect(e).toMatchObject({ artist: "LUMIRISE", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎", startAt: "2026-10-30T18:00:00+09:00", timeUnknown: false });
    expect(JSON.stringify(e)).not.toContain("support@example.com");
  });

  it("handles multiple blocks and infers the year", async () => {
    const { parseEventsFromText } = await import("@/lib/eventDetection/parseText");
    const now = Date.parse("2026-11-20T12:00:00+09:00");
    const text = `ASTRONOVA TOUR 東京ドーム 12/15 18:30

SOLA FLARE FAN MEETING
1/10 横浜アリーナ`;
    const r = parseEventsFromText(text, now);
    expect(r.map((e) => [e.artist, e.startAt.slice(0, 16), e.venueStation])).toEqual([
      ["ASTRONOVA", "2026-12-15T18:30", "水道橋"],
      ["SOLA FLARE", "2027-01-10T18:00", "新横浜"],
    ]);
    expect(r[1].timeUnknown).toBe(true);
  });

  it("ignores text without dates or past dates", async () => {
    const { parseEventsFromText } = await import("@/lib/eventDetection/parseText");
    const now = Date.parse("2026-09-27T12:00:00+09:00");
    expect(parseEventsFromText("LUMIRISE 京セラドーム公演 楽しみ！", now)).toEqual([]);
    expect(parseEventsFromText("LUMIRISE LIVE 2025年1月1日 18:00", now)).toEqual([]);
  });
});

describe("artist extraction with English venue words", () => {
  it("stops at DOME / ARENA", async () => {
    const { parseEventsFromText } = await import("@/lib/eventDetection/parseText");
    const now = Date.parse("2026-09-27T12:00:00+09:00");
    const [e] = parseEventsFromText("公演名：TWICE DOME TOUR\n日時：2026年12月20日 開演17:00\n会場：バンテリンドーム ナゴヤ", now);
    expect(e).toMatchObject({ artist: "TWICE", venueStation: "ナゴヤドーム前矢田", startAt: "2026-12-20T17:00:00+09:00" });
  });
});

import { describe, expect, it } from "vitest";
import { extractByRules, isLiveCandidate, pickLiveCandidates } from "@/lib/eventDetection/detect";
import { demoCalendarItems } from "@/lib/demo/calendar";

const future = (days: number, time = "18:00:00") => new Date(Date.now() + days * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10) + `T${time}+09:00`;

describe("live event detection", () => {
  it("keeps only live-like events and drops everything else", () => {
    const items = [
      { id: "a", summary: "IVE 京セラドーム公演", location: "京セラドーム大阪", start: { dateTime: future(30) } },
      { id: "b", summary: "歯医者", location: "〇〇歯科", start: { dateTime: future(3, "10:00:00") } },
      { id: "c", summary: "定例会議 tour of office", start: { dateTime: future(4, "10:00:00") } },
      { id: "d", summary: "友達とランチ", start: { dateTime: future(5, "12:00:00") } },
    ];
    const c = pickLiveCandidates(items);
    expect(c).toHaveLength(1);
    expect(c[0].summary).toBe("IVE 京セラドーム公演");
    expect(JSON.stringify(c)).not.toMatch(/歯医者|会議|ランチ/);
  });

  it("drops past and cancelled events, marks all-day as time-unknown", () => {
    const c = pickLiveCandidates([
      { id: "p", summary: "IVE LIVE", start: { dateTime: "2020-01-01T18:00:00+09:00" } },
      { id: "x", summary: "IVE LIVE", status: "cancelled", start: { dateTime: future(10) } },
      { id: "y", summary: "SEVENTEEN TOUR 東京ドーム", start: { date: future(20).slice(0, 10) } },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].timeUnknown).toBe(true);
    expect(c[0].startAt).toMatch(/T18:00:00\+09:00$/);
  });

  it("masks contact info inside candidate text", () => {
    const c = pickLiveCandidates([{ id: "m", summary: "IVE LIVE 連絡 foo@bar.com", start: { dateTime: future(10) } }]);
    expect(c[0].summary).not.toContain("foo@bar.com");
  });

  it("extracts artist / venue / station by rules", () => {
    const [a, b, c] = pickLiveCandidates(demoCalendarItems(Date.now())).map(extractByRules);
    expect(a).toMatchObject({ artist: "IVE", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎", confidence: "high" });
    expect(b).toMatchObject({ artist: "LE SSERAFIM", venue: "横浜アリーナ", venueStation: "新横浜" });
    expect(b.title).toBe("LE SSERAFIM FAN MEETING");
    expect(c).toMatchObject({ artist: "SEVENTEEN", venue: "東京ドーム", venueStation: "水道橋" });
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
    expect(matchVenue("LE SSERAFIM FAN MEETING")).toBeNull();
  });
});

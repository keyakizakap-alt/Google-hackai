import { describe, expect, it } from "vitest";
import { venueArea } from "@/lib/eventDetection/venues";
import { searchSpots, SPOT_AREAS, SPOTS } from "@/lib/services/spots";

describe("会場 → エリアの解決", () => {
  it("会場名から引ける", () => {
    expect(venueArea("京セラドーム大阪")).toBe("大阪");
    expect(venueArea("東京ドーム")).toBe("東京");
  });
  it("別名からも引ける", () => {
    expect(venueArea("京セラドーム")).toBe("大阪");
    expect(venueArea("たまアリ")).toBe("埼玉");
  });
  it("会場が分からなければ最寄り駅で引く", () => {
    expect(venueArea("どこかのホール", "新横浜")).toBe("神奈川");
  });
  it("どちらでも分からなければ undefined", () => {
    expect(venueArea("架空アリーナ")).toBeUndefined();
  });
});

describe("立ち寄り先の検索", () => {
  it("空き時間に収まるものだけ返す（往復の移動を含めて判定）", () => {
    const found = searchSpots({ area: "東京", availableMinutes: 60 });
    expect(found.length).toBeGreaterThan(0);
    for (const s of found) {
      expect(s.minutesFromVenue * 2 + s.stayMinutes).toBeLessThanOrEqual(60);
    }
  });

  it("時間が足りなければ空になる", () => {
    expect(searchSpots({ area: "東京", availableMinutes: 20 })).toHaveLength(0);
  });

  it("近い順に並ぶ", () => {
    const found = searchSpots({ area: "大阪", availableMinutes: 480 });
    const mins = found.map((s) => s.minutesFromVenue);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it("カテゴリで絞れる", () => {
    const found = searchSpots({ area: "福岡", availableMinutes: 480, category: "gourmet" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((s) => s.category === "gourmet")).toBe(true);
  });

  it("雨のときは屋内だけに絞れる", () => {
    const all = searchSpots({ area: "大阪", availableMinutes: 480 });
    const indoor = searchSpots({ area: "大阪", availableMinutes: 480, indoorOnly: true });
    expect(indoor.every((s) => s.indoor)).toBe(true);
    expect(indoor.length).toBeLessThan(all.length); // 屋外の候補が実際に除かれる
  });

  it("都道府県の接尾辞があっても引ける", () => {
    expect(searchSpots({ area: "大阪府", availableMinutes: 480 }).length).toBeGreaterThan(0);
  });

  it("対象外のエリアは空", () => {
    expect(searchSpots({ area: "沖縄", availableMinutes: 480 })).toHaveLength(0);
  });
});

describe("データの健全性", () => {
  it("ID が重複していない", () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
  });

  it("会場辞書のエリアをすべて持っている", () => {
    const venueAreas = ["東京", "神奈川", "大阪", "愛知", "北海道", "福岡", "千葉", "兵庫", "宮城", "埼玉", "静岡", "広島"];
    for (const a of venueAreas) expect(SPOT_AREAS, a).toContain(a);
  });

  it("どのエリアにも屋内の候補が最低 1 件ある（雨天でも提案できる）", () => {
    for (const area of SPOT_AREAS) {
      expect(SPOTS.filter((s) => s.area === area && s.indoor).length, area).toBeGreaterThan(0);
    }
  });

  it("所要時間が現実的な範囲に収まっている", () => {
    for (const s of SPOTS) {
      expect(s.minutesFromVenue, s.id).toBeGreaterThan(0);
      expect(s.minutesFromVenue, s.id).toBeLessThanOrEqual(60);
      expect(s.stayMinutes, s.id).toBeGreaterThanOrEqual(20);
    }
  });
});

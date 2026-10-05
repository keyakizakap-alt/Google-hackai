import { describe, expect, it } from "vitest";
import { classifyCode, classifyText, JMA_AREA_CODE, jstDateKey, parseForecast } from "@/lib/signals/weather";

/**
 * 気象庁のエンドポイントはこの開発環境から到達できないため、
 * 公開仕様どおりに組んだレスポンスでパーサだけを検証する。
 * 実レスポンスとの突き合わせはデプロイ後に必要。
 */

describe("天気コードの分類", () => {
  it("先頭の数字で区分する", () => {
    expect(classifyCode("100")).toBe("clear");
    expect(classifyCode("201")).toBe("cloudy");
    expect(classifyCode("314")).toBe("rain");
    expect(classifyCode("402")).toBe("snow");
    expect(classifyCode("")).toBeUndefined();
    expect(classifyCode("x")).toBeUndefined();
  });
});

describe("天気文言の分類", () => {
  it("複合表現は影響の大きい方を採る", () => {
    expect(classifyText("晴れ")).toBe("clear");
    expect(classifyText("くもり")).toBe("cloudy");
    expect(classifyText("くもり　時々　雨")).toBe("rain");
    expect(classifyText("雨　のち　雪")).toBe("snow"); // 雪を優先
    expect(classifyText("")).toBeUndefined();
  });
});

describe("jstDateKey", () => {
  it("UTC をまたぐ時刻でも JST の日付になる", () => {
    expect(jstDateKey("2026-10-27T15:00:00Z")).toBe("2026-10-28"); // JST 翌日 0:00
    expect(jstDateKey("2026-10-27T14:59:00Z")).toBe("2026-10-27");
    expect(jstDateKey("not a date")).toBe("");
  });
});

const payload = (defines: string[], weathers?: string[], codes?: string[]) => [
  {
    timeSeries: [
      { timeDefines: defines, areas: [{ area: { name: "南部" }, ...(weathers ? { weathers } : {}), ...(codes ? { weatherCodes: codes } : {}) }] },
    ],
  },
];

describe("気象庁レスポンスのパース", () => {
  it("対象日の天気文言を取り出す", () => {
    const f = parseForecast(
      payload(["2026-10-27T05:00:00+09:00", "2026-10-28T05:00:00+09:00"], ["晴れ", "くもり　時々　雨"]),
      "2026-10-28",
    );
    expect(f?.sky).toBe("rain");
    expect(f?.text).toBe("くもり 時々 雨"); // 全角スペースを正規化
    expect(f?.needsRainGear).toBe(true);
    expect(f?.source).toBe("jma");
  });

  it("文言が無ければ週間予報のコードで判定する", () => {
    const f = parseForecast(payload(["2026-11-02T00:00:00+09:00"], undefined, ["402"]), "2026-11-02");
    expect(f?.sky).toBe("snow");
    expect(f?.needsRainGear).toBe(true);
    expect(f?.text).toBe("");
  });

  it("晴れ・くもりでは雨具を要求しない", () => {
    expect(parseForecast(payload(["2026-10-27T05:00:00+09:00"], ["晴れ"]), "2026-10-27")?.needsRainGear).toBe(false);
    expect(parseForecast(payload(["2026-10-27T05:00:00+09:00"], ["くもり"]), "2026-10-27")?.needsRainGear).toBe(false);
  });

  it("予報の範囲外は undefined（公演が先すぎる場合）", () => {
    expect(parseForecast(payload(["2026-10-27T05:00:00+09:00"], ["晴れ"]), "2026-12-01")).toBeUndefined();
  });

  it("壊れた入力でも例外を投げない", () => {
    expect(parseForecast([], "2026-10-27")).toBeUndefined();
    expect(parseForecast(null, "2026-10-27")).toBeUndefined();
    expect(parseForecast([{ timeSeries: [] }], "2026-10-27")).toBeUndefined();
    expect(parseForecast([{ timeSeries: [{ timeDefines: [], areas: [] }] }], "2026-10-27")).toBeUndefined();
    expect(parseForecast(payload(["2026-10-27T05:00:00+09:00"], ["晴れ"]), "")).toBeUndefined();
  });

  it("後ろの timeSeries までたどって見つける（週間予報は 2 ブロック目）", () => {
    const multi = [
      { timeSeries: [{ timeDefines: ["2026-10-27T05:00:00+09:00"], areas: [{ weathers: ["晴れ"] }] }] },
      { timeSeries: [{ timeDefines: ["2026-11-01T00:00:00+09:00"], areas: [{ weatherCodes: ["314"] }] }] },
    ];
    expect(parseForecast(multi, "2026-11-01")?.sky).toBe("rain");
  });
});

describe("予報区コード", () => {
  it("会場辞書に出てくるエリアをすべて網羅している", () => {
    const venueAreas = ["東京", "神奈川", "大阪", "愛知", "北海道", "福岡", "千葉", "兵庫", "宮城", "埼玉", "静岡", "広島"];
    for (const a of venueAreas) expect(JMA_AREA_CODE[a], a).toBeDefined();
  });
  it("47 都道府県ぶんある", () => {
    expect(Object.keys(JMA_AREA_CODE)).toHaveLength(47);
  });
});

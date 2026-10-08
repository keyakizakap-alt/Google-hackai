import "server-only";
import { logger } from "../logger";

/**
 * 公演日の天気を気象庁の公開 JSON から取得する。
 *
 * 推し活の遠征では天気が準備内容を左右する。雨ならヘアセットは当日朝に寄せたいし、
 * 物販の待機が屋外なら雨具が要る。エージェントが必要と判断したときだけ呼ぶ。
 *
 * 設計上の前提:
 * - **API キー不要・無料**。追加の課金は発生しない
 * - 公式 API としての提供ではないため、仕様変更の可能性がある
 * - 取得できなくてもプラン作成は止めない。天気は補助情報で、
 *   無ければ「確認してください」と伝えるだけで計画は成立する
 */

const ENDPOINT = "https://www.jma.go.jp/bosai/forecast/data/forecast/{code}.json";

/** 会場辞書の area 名 → 気象庁の府県予報区コード。北海道と沖縄は拠点を含む区を選ぶ */
export const JMA_AREA_CODE: Readonly<Record<string, string>> = {
  北海道: "016000", 青森: "020000", 岩手: "030000", 宮城: "040000",
  秋田: "050000", 山形: "060000", 福島: "070000", 茨城: "080000",
  栃木: "090000", 群馬: "100000", 埼玉: "110000", 千葉: "120000",
  東京: "130000", 神奈川: "140000", 新潟: "150000", 富山: "160000",
  石川: "170000", 福井: "180000", 山梨: "190000", 長野: "200000",
  岐阜: "210000", 静岡: "220000", 愛知: "230000", 三重: "240000",
  滋賀: "250000", 京都: "260000", 大阪: "270000", 兵庫: "280000",
  奈良: "290000", 和歌山: "300000", 鳥取: "310000", 島根: "320000",
  岡山: "330000", 広島: "340000", 山口: "350000", 徳島: "360000",
  香川: "370000", 愛媛: "380000", 高知: "390000", 福岡: "400000",
  佐賀: "410000", 長崎: "420000", 熊本: "430000", 大分: "440000",
  宮崎: "450000", 鹿児島: "460100", 沖縄: "471000",
};

export type Sky = "clear" | "cloudy" | "rain" | "snow";

export interface Forecast {
  /** 対象日（JST の YYYY-MM-DD） */
  date: string;
  sky: Sky;
  /** 気象庁の天気文言。週間予報の場合は空 */
  text: string;
  /** 雨具・濡れ対策が要るか（UI とプロンプトの両方で使う） */
  needsRainGear: boolean;
  source: "jma";
}

/**
 * 気象庁の天気コードを 4 つの区分に落とす。
 * 先頭の数字が区分を表す（1=晴 2=曇 3=雨 4=雪）。
 */
export function classifyCode(code: string): Sky | undefined {
  switch (code.trim()[0]) {
    case "1": return "clear";
    case "2": return "cloudy";
    case "3": return "rain";
    case "4": return "snow";
    default: return undefined;
  }
}

/** 天気文言から区分を判定する。複合表現は影響の大きい方を採る */
export function classifyText(text: string): Sky | undefined {
  if (text.includes("雪")) return "snow";
  if (text.includes("雨")) return "rain";
  if (text.includes("晴")) return "clear";
  if (text.includes("曇") || text.includes("くもり")) return "cloudy";
  return undefined;
}

/** ISO 日時 → JST の YYYY-MM-DD */
export function jstDateKey(iso: string | number): string {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 気象庁のレスポンスから対象日の予報を取り出す（ネットワークから分離してテストする）。
 *
 * payload[0] は直近 3 日（天気文言つき）、payload[1] は週間予報（コードのみ）。
 * 近い日付は文言のある方を優先し、先の日付は週間予報で補う。
 */
export function parseForecast(payload: unknown, dateKey: string): Forecast | undefined {
  if (!Array.isArray(payload) || !dateKey) return undefined;

  const pick = (series: unknown): { code?: string; text?: string } | undefined => {
    if (!series || typeof series !== "object") return undefined;
    const { timeDefines, areas } = series as { timeDefines?: unknown; areas?: unknown };
    if (!Array.isArray(timeDefines) || !Array.isArray(areas) || areas.length === 0) return undefined;
    const i = timeDefines.findIndex((t) => typeof t === "string" && jstDateKey(t) === dateKey);
    if (i < 0) return undefined;
    const a = areas[0] as { weathers?: unknown; weatherCodes?: unknown };
    const text = Array.isArray(a.weathers) && typeof a.weathers[i] === "string" ? (a.weathers[i] as string) : undefined;
    const code = Array.isArray(a.weatherCodes) && typeof a.weatherCodes[i] === "string" ? (a.weatherCodes[i] as string) : undefined;
    return text || code ? { code, text } : undefined;
  };

  for (const block of payload) {
    const series = (block as { timeSeries?: unknown })?.timeSeries;
    if (!Array.isArray(series)) continue;
    for (const s of series) {
      const hit = pick(s);
      if (!hit) continue;
      const sky = (hit.text ? classifyText(hit.text) : undefined) ?? (hit.code ? classifyCode(hit.code) : undefined);
      if (!sky) continue;
      return {
        date: dateKey,
        sky,
        text: (hit.text ?? "").replace(/　/g, " ").trim(),
        needsRainGear: sky === "rain" || sky === "snow",
        source: "jma",
      };
    }
  }
  return undefined;
}

/** エリア単位のキャッシュ。気象庁の更新は 1 日数回なので長めに保持する */
const CACHE_TTL_MS = 3 * 3_600_000;
/**
 * 取得に失敗したときも短時間だけ覚えておく。
 * 到達できない環境で毎回タイムアウトを待つと、プラン作成の時間を無駄に使うため。
 */
const FAILURE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; payload: unknown }>();

/** テスト用にキャッシュを空にする */
export function clearForecastCache() {
  cache.clear();
}

/**
 * 指定エリア・指定日の予報を返す。取得できない場合は undefined（例外は投げない）。
 *
 * 気象庁が返すのは直近 1 週間程度なので、公演がそれより先なら undefined になる。
 * 「まだ分からない」ことを呼び出し側がそのまま利用者に伝えられるようにしている。
 */
export async function getForecast(area: string, targetIso: string, now = Date.now()): Promise<Forecast | undefined> {
  const code = JMA_AREA_CODE[area.replace(/[都道府県]$/, "")];
  const dateKey = jstDateKey(targetIso);
  if (!code || !dateKey) return undefined;

  const hit = cache.get(code);
  if (hit) {
    // payload === null は「直前に失敗した」印。TTL の間は再試行しない
    const ttl = hit.payload === null ? FAILURE_TTL_MS : CACHE_TTL_MS;
    if (now - hit.at < ttl) {
      if (hit.payload === null) return undefined;
      const cachedForecast = parseForecast(hit.payload, dateKey);
      logger.info("weather.lookup", { weather: cachedForecast?.sky ?? "unknown", cached: true });
      return cachedForecast;
    }
  }

  try {
    const res = await fetch(ENDPOINT.replace("{code}", code), {
      signal: AbortSignal.timeout(4_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      cache.set(code, { at: now, payload: null });
      logger.warn("weather.http_error", { httpStatus: res.status });
      return undefined;
    }
    const payload = await res.json();
    cache.set(code, { at: now, payload });
    const forecast = parseForecast(payload, dateKey);
    logger.info("weather.lookup", { weather: forecast?.sky ?? "unknown", cached: false });
    return forecast;
  } catch (e) {
    // 天気は補助情報。取れなくてもプラン作成は続行させる
    cache.set(code, { at: now, payload: null });
    logger.warn("weather.failed", { errorCode: (e as Error).name });
    return undefined;
  }
}

import type { BeautyService } from "../agent/types";
import { hotpepperSearchUrl } from "../safeUrl";
import { jstAt, jstDateKey, MS_MIN, toJstIso } from "../time";

/**
 * 美容メニューの逆算ガイドライン（エージェントのグラウンディング用ナレッジ）。
 * 一般的な目安であり、医療的な助言ではない。
 */
export const BEAUTY_GUIDELINES: Record<
  BeautyService,
  { label: string; durationMin: number; idealDaysBefore: [number, number]; note: string }
> = {
  brow: { label: "眉毛サロン（WAX・スタイリング）", durationMin: 60, idealDaysBefore: [2, 4], note: "WAX 直後は赤みが出ることがあるため当日・前日は避ける" },
  hair: { label: "ヘアカット・カラー", durationMin: 90, idealDaysBefore: [2, 5], note: "切りたてより 2〜3 日なじませると自然に見える" },
  nail: { label: "ネイル", durationMin: 90, idealDaysBefore: [1, 3], note: "欠け防止のため直前が理想" },
  eyelash: { label: "まつげパーマ", durationMin: 60, idealDaysBefore: [1, 3], note: "施術後 24 時間は濡らさないのが一般的" },
  skincare: { label: "フェイシャルエステ", durationMin: 60, idealDaysBefore: [3, 5], note: "肌の反応が落ち着く時間を確保する" },
};

export interface SalonSlot {
  slotId: string;
  salonName: string;
  service: BeautyService;
  start: string;
  end: string;
  priceJpy: number;
  nearestStation: string;
  bookingUrl: string;
}

const SALONS: Record<BeautyService, { name: string; price: number; walk: string }[]> = {
  brow: [
    { name: "Brow Lab Lumière", price: 6600, walk: "徒歩3分" },
    { name: "眉とまつげの専門店 Mellow", price: 5500, walk: "徒歩6分" },
  ],
  hair: [
    { name: "HAIR ROOM Pétale", price: 7700, walk: "徒歩4分" },
    { name: "salon de Lilas", price: 6600, walk: "徒歩8分" },
  ],
  nail: [
    { name: "Nail Atelier Rosé", price: 8800, walk: "徒歩5分" },
    { name: "nail salon Tulle", price: 7150, walk: "徒歩2分" },
  ],
  eyelash: [
    { name: "Lash Studio Aube", price: 5940, walk: "徒歩3分" },
    { name: "眉とまつげの専門店 Mellow", price: 5500, walk: "徒歩6分" },
  ],
  skincare: [
    { name: "Esthé Salon Nuage", price: 9900, walk: "徒歩7分" },
    { name: "Facial Care Blanc", price: 8580, walk: "徒歩4分" },
  ],
};

/** 決定的な疑似乱数（同じ入力なら同じ空き枠を返す＝デモの再現性） */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * サロンの空き枠検索（モック）。ホットペッパービューティー等の予約 API に差し替える前提のアダプタ。
 * window 内に収まり、営業時間（10:00-21:00）内の枠だけを返す。
 */
export function searchSalonSlots(params: {
  service: BeautyService;
  station: string;
  windowStart: string;
  windowEnd: string;
  limit?: number;
}): SalonSlot[] {
  const { service, station, windowStart, windowEnd, limit = 6 } = params;
  const ws = Date.parse(windowStart);
  const we = Date.parse(windowEnd);
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return [];
  const duration = BEAUTY_GUIDELINES[service].durationMin * MS_MIN;
  const out: SalonSlot[] = [];

  for (let day = Date.parse(`${jstDateKey(ws)}T00:00:00+09:00`); day <= we; day += 24 * 60 * MS_MIN) {
    const key = jstDateKey(day);
    for (const salon of SALONS[service]) {
      for (let t = jstAt(key, 10); t + duration <= jstAt(key, 21); t += 30 * MS_MIN) {
        if (t < ws || t + duration > we) continue;
        // 約 4 割の枠は埋まっている想定
        if (hash(`${salon.name}|${t}`) % 10 < 4) continue;
        out.push({
          slotId: `${service}-${hash(salon.name + t).toString(36)}`,
          salonName: salon.name,
          service,
          start: toJstIso(t),
          end: toJstIso(t + duration),
          priceJpy: salon.price,
          nearestStation: `${station}駅 ${salon.walk}`,
          bookingUrl: hotpepperSearchUrl(`${station} ${BEAUTY_GUIDELINES[service].label.split("（")[0]}`),
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

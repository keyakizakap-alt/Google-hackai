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

/** 実際の空席ではなく、本人の予定に入れられる施術候補日時。 */
export interface SalonSlot {
  slotId: string;
  salonName: string;
  service: BeautyService;
  start: string;
  end: string;
  nearestStation: string;
  bookingUrl: string;
}

/** 店舗の空席を推測せず、日程候補のみを計算する。 */
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
    for (let t = jstAt(key, 10); t + duration <= jstAt(key, 21); t += 60 * MS_MIN) {
      if (t < ws || t + duration > we) continue;
      out.push({
        slotId: `${service}-${t}`,
        salonName: "予約サイトで店舗と空きを確認",
        service,
        start: toJstIso(t),
        end: toJstIso(t + duration),
        nearestStation: `${station}駅周辺`,
        bookingUrl: hotpepperSearchUrl(`${station} ${BEAUTY_GUIDELINES[service].label.split("（")[0]}`),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

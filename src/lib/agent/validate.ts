import { overlapsBusy } from "../availability";
import type { BusyBlock } from "../privacy/mask";
import { BEAUTY_GUIDELINES } from "../services/beauty";
import { jstDayDiff, MS_MIN } from "../time";
import { BEAUTY_SERVICES, type BeautyService, type OshiEvent, type TimelineItem } from "./types";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const isBeautyService = (c?: string): c is BeautyService => !!c && (BEAUTY_SERVICES as readonly string[]).includes(c);

/**
 * エージェントが提出したタイムラインを検証する（自己修正ループの判定器）。
 * errors があれば submit_timeline は差し戻され、Gemini が自律的に組み直す。
 */
export function validateTimeline(items: readonly TimelineItem[], event: OshiEvent, busy: readonly BusyBlock[], now = Date.now()): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eventStart = Date.parse(event.startAt);

  const sorted = [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const it of sorted) {
    const s = Date.parse(it.start);
    const e = Date.parse(it.end);
    if (!(e > s)) errors.push(`${it.id}: 終了時刻が開始時刻より前です`);
    if (s < now - 5 * MS_MIN) errors.push(`${it.id}: 過去の日時は指定できません`);

    if (it.kind === "beauty") {
      if (it.provider && (it.provider.name !== "予約サイトで店舗と空きを確認" || it.provider.priceJpy !== undefined || it.provider.slotId)) {
        errors.push(`${it.id}: 実際の店舗・空席・価格は取得していません。候補日時として案内してください`);
      }
      if (e > eventStart) errors.push(`${it.id}: 美容予定はイベント開始前に終わる必要があります`);
      if (overlapsBusy(busy, s, e, 15)) errors.push(`${it.id}: カレンダーの既存予定（前後15分の移動バッファ含む）と重なっています`);
      if (isBeautyService(it.category)) {
        const [minD, maxD] = BEAUTY_GUIDELINES[it.category].idealDaysBefore;
        const d = jstDayDiff(event.startAt, it.start);
        if (d < minD || d > maxD) warnings.push(`${it.title} は推奨（${minD}〜${maxD}日前）から外れています（${d}日前）`);
      }
    }

    if (it.kind === "transit" && overlapsBusy(busy, s, e)) {
      warnings.push(`${it.title} がカレンダーの既存予定と重なっています。休暇などの調整が必要です`);
    }
    // 往路（開演前に出発する移動）は開演 45 分前までに到着していること
    if (it.kind === "transit" && s < eventStart && (eventStart - e) / MS_MIN < 45) {
      errors.push(`${it.id}: 会場到着が開演 45 分前より遅いです（入場・混雑リスク）`);
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.kind === "event" || cur.kind === "event" || prev.kind === "stay" || cur.kind === "stay") continue;
    if (Date.parse(cur.start) < Date.parse(prev.end)) {
      errors.push(`${prev.id} と ${cur.id} の時間が重なっています`);
    }
  }

  const requested = new Set(event.beautyServices);
  for (const svc of requested) {
    if (!sorted.some((it) => it.kind === "beauty" && it.category === svc)) {
      warnings.push(`希望メニュー「${BEAUTY_GUIDELINES[svc].label}」がプランに含まれていません`);
    }
  }
  if (!sorted.some((it) => it.kind === "transit" || (it.kind === "prep" && it.category === "transit-check"))) {
    errors.push("移動経路、または経路を確認する手順が含まれていません");
  }

  return { errors, warnings };
}

import type { OshiEvent } from "../agent/types";
import type { DetectedLiveEvent } from "../eventDetection/detect";

/** カレンダー側でライブの日時が変わったもの */
export interface CalendarUpdate {
  before: OshiEvent;
  after: OshiEvent;
}

export interface MergeResult {
  events: OshiEvent[];
  added: number;
  updated: CalendarUpdate[];
}

type Profile = Pick<OshiEvent, "homeStation" | "beautyServices" | "arriveEarlyForGoods">;

/**
 * カレンダーから見つけたライブを、今のライブ一覧にまとめる。
 * - 新しいライブは追加する（削除したものは復活させない）
 * - 取り込み済みのライブは、開始日時が変わったときだけ更新する。
 *   ライブ名・会場名は AI の読み取りで表記が揺れることがあり、揺れのたびにプランを作り直さないよう比べない
 * - 出発駅・美容メニュー・物販の希望など、利用者が決めた内容は書き換えない
 */
export function mergeCalendarEvents(current: readonly OshiEvent[], detected: readonly DetectedLiveEvent[], dismissed: readonly string[], profile: Profile): MergeResult {
  const byId = new Map(current.map((e) => [e.id, e]));
  const skip = new Set(dismissed);
  const next = new Map(byId);
  const updated: CalendarUpdate[] = [];
  let added = 0;

  for (const d of detected) {
    const id = `cal-${d.key}`;
    if (skip.has(id)) continue;
    const existing = byId.get(id);
    if (existing) {
      if (existing.startAt !== d.startAt || Boolean(existing.timeUnknown) !== d.timeUnknown) {
        const after: OshiEvent = { ...existing, startAt: d.startAt, timeUnknown: d.timeUnknown };
        next.set(id, after);
        updated.push({ before: existing, after });
      }
      continue;
    }
    // 古い版の取り込み（日時もキーに含めていた）と同じライブなら、重複して追加しない
    const sameAsOld = current.some((e) => e.id.startsWith("cal-") && e.startAt === d.startAt && e.title === d.title);
    if (sameAsOld) continue;
    next.set(id, {
      id,
      artist: d.artist,
      title: d.title,
      venue: d.venue,
      venueStation: d.venueStation,
      startAt: d.startAt,
      homeStation: profile.homeStation,
      beautyServices: profile.beautyServices,
      arriveEarlyForGoods: profile.arriveEarlyForGoods,
      source: "calendar",
      timeUnknown: d.timeUnknown,
    });
    added += 1;
  }

  const events = [...next.values()].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  return { events, added, updated };
}

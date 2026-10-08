import "server-only";
import { venueArea } from "../eventDetection/venues";
import { getForecast } from "../signals/weather";
import { collectBusy } from "../sources";
import { withoutEventBlock } from "./conflicts";
import type { PlanEnvelope, PlanStatus } from "./types";
import { detectSignals, signalKey, type WatchSignal } from "./watch";

/** 見張りの対象にする状態。生成中・却下済みは対象外 */
export const WATCHED_STATUSES: ReadonlySet<PlanStatus> = new Set(["pending_approval", "approved", "booked"]);

/**
 * プランの見張り（AI は呼ばない）。カレンダーの重なりと公演日の天気を確かめる。
 * カレンダーは時間帯だけ、天気は気象庁の公開 JSON。どちらも取れなければその項目は調べなかった扱いにする。
 */
export async function watchPlan(env: PlanEnvelope, now = Date.now()): Promise<{
  signals: WatchSignal[];
  key: string;
  calendarChecked: boolean;
  weather?: { date: string; sky: string; text: string };
}> {
  const { plan } = env;
  const upcoming = plan.items.filter((i) => i.kind !== "event" && Date.parse(i.start) > now);
  let busy = null;
  if (upcoming.length) {
    const to = Math.max(...upcoming.map((i) => Date.parse(i.end))) + 60_000;
    const fetched = await collectBusy({ from: now, to });
    busy = fetched.source === "calendar" ? withoutEventBlock(fetched.busy, plan.event.startAt) : null;
  }
  const area = venueArea(plan.event.venue, plan.event.venueStation);
  const forecast = area && Date.parse(plan.event.startAt) > now ? await getForecast(area, plan.event.startAt, now) : undefined;
  const signals = detectSignals({ plan, busy, forecast, now });
  return {
    signals,
    key: signalKey(plan, signals),
    calendarChecked: busy !== null,
    weather: forecast ? { date: forecast.date, sky: forecast.sky, text: forecast.text } : undefined,
  };
}

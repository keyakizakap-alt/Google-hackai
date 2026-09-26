import "server-only";
import { BEAUTY_GUIDELINES } from "../services/beauty";
import { MS_MIN, toJstIso } from "../time";
import { daysBefore, executeTool, type AgentContext } from "./tools";
import type { TimelineItem, TraceStep } from "./types";

/**
 * Gemini 未設定・障害時のルールベース・プランナー。
 * エージェントと同じツール・同じ検証（submit_timeline）を通すため、安全性の前提は変わらない。
 */
export async function runRuleBasedPlanner(ctx: AgentContext, trace: TraceStep[]): Promise<void> {
  const { event } = ctx;
  const items: TimelineItem[] = [];
  let step = trace.length;
  const call = async (name: string, args: Record<string, unknown>) => {
    const started = Date.now();
    const out = await executeTool(name, args, ctx);
    trace.push({ step: ++step, type: "tool", name, ok: out.ok, latencyMs: Date.now() - started, summary: out.summary });
    return out;
  };

  for (const svc of event.beautyServices) {
    const g = BEAUTY_GUIDELINES[svc];
    // 推奨範囲 → 範囲外（前後）の順に探す
    const [minD, maxD] = g.idealDaysBefore;
    const ideal = Array.from({ length: maxD - minD + 1 }, (_, i) => minD + i);
    const order = [...ideal, maxD + 1, maxD + 2, minD - 1].filter((d) => d >= 1);
    for (const d of order) {
      const out = await call("search_beauty_salons", {
        service: svc,
        station: event.homeStation,
        window_start: toJstIso(daysBefore(event.startAt, d, 9)),
        window_end: toJstIso(daysBefore(event.startAt, d, 21)),
      });
      const slots = (out.response.slots ?? []) as { slotId: string; salonName: string; start: string; end: string; priceJpy: number; nearestStation: string; bookingUrl: string }[];
      const taken = slots.find((s) => !items.some((it) => Date.parse(s.start) < Date.parse(it.end) && Date.parse(s.end) > Date.parse(it.start)));
      if (taken) {
        items.push({
          id: `${svc}-1`,
          kind: "beauty",
          category: svc,
          title: g.label.split("（")[0],
          start: taken.start,
          end: taken.end,
          location: taken.nearestStation,
          provider: { name: taken.salonName, priceJpy: taken.priceJpy, bookingUrl: taken.bookingUrl, slotId: taken.slotId },
          rationale: ideal.includes(d)
            ? `${g.note}。空き時間と推奨タイミング（${d}日前）が一致する枠を選択しました。`
            : `推奨（${minD}〜${maxD}日前）の空き枠がなかったため、最も近い${d}日前を提案します。${g.note}。`,
          requiresBooking: true,
        });
        break;
      }
    }
  }

  const eventStart = Date.parse(event.startAt);
  const arriveBy = eventStart - (event.arriveEarlyForGoods ? 180 : 90) * MS_MIN;
  await call("estimate_crowd", { at: toJstIso(arriveBy) });
  const routeOut = await call("search_transit_route_mock", { from_station: event.homeStation, to_station: event.venueStation, arrive_by: toJstIso(arriveBy) });
  const r = routeOut.response as { departure: string; arrival: string; summary: string; fareJpy: number; legs: { line: string; from: string; to: string; departure: string; arrival: string }[] };
  items.push({
    id: "transit-out",
    kind: "transit",
    category: "train",
    title: `${event.homeStation}駅 出発`,
    start: r.departure,
    end: r.arrival,
    route: { from: event.homeStation, to: event.venueStation, summary: r.summary, legs: r.legs, fareJpy: r.fareJpy, source: "mock" },
    rationale: "開演直前の最混雑帯を避け、物販にも間に合う到着時刻から逆算しました。",
    requiresBooking: true,
  });

  if (ctx.skin) {
    const t = daysBefore(event.startAt, 1, 22);
    items.push({
      id: "prep-skincare",
      kind: "prep",
      category: "selfcare",
      title: "保湿パック＆早めの就寝",
      start: toJstIso(t),
      end: toJstIso(t + 30 * MS_MIN),
      rationale: ctx.skin.advice[0] ?? "前日のセルフケアで当日の肌を整えます。",
      requiresBooking: false,
    });
  }

  items.push({
    id: "event-main",
    kind: "event",
    category: "live",
    title: event.title,
    start: event.startAt,
    end: toJstIso(eventStart + 180 * MS_MIN),
    location: event.venue,
    rationale: "推しに会う日！",
    requiresBooking: false,
  });
  items.push({
    id: "stay-1",
    kind: "stay",
    category: "hotel",
    title: "会場周辺に後泊",
    start: toJstIso(eventStart + 210 * MS_MIN),
    end: toJstIso(eventStart + 16 * 60 * MS_MIN),
    location: `${event.venueStation}周辺`,
    provider: { name: "宿泊予約サイトで検索", bookingUrl: `https://www.jalan.net/uw/uwp1700/uww1701.do?keyword=${encodeURIComponent(event.venue)}` },
    rationale: "終演後は帰宅手段がないため、会場周辺での宿泊をおすすめします。",
    requiresBooking: true,
  });

  await call("submit_timeline", {
    summary: `${event.title} に向けて、美容 ${items.filter((i) => i.kind === "beauty").length} 件と移動・宿泊を逆算しました。`,
    items,
    warnings: [],
  });
}

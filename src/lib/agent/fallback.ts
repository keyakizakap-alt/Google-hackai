import "server-only";
import { BEAUTY_GUIDELINES } from "../services/beauty";
import { transitSearchUrl } from "../safeUrl";
import type { TravelEstimate } from "../services/travelEstimate";
import { formatJst, MS_MIN, toJstIso } from "../time";
import { daysBefore, executeTool, type AgentContext } from "./tools";
import type { Decision, TimelineItem, TraceStep } from "./types";

/**
 * Gemini 未設定・障害時のルールベース・プランナー。
 * エージェントと同じツール・同じ検証（submit_timeline）を通すため、安全性の前提は変わらない。
 */
export async function runRuleBasedPlanner(ctx: AgentContext, trace: TraceStep[]): Promise<void> {
  const { event } = ctx;
  const items: TimelineItem[] = [];
  const decisions: Decision[] = [];
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
      const slots = (out.response.slots ?? []) as { slotId: string; salonName: string; start: string; end: string; nearestStation: string; bookingUrl: string }[];
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
          provider: { name: taken.salonName, bookingUrl: taken.bookingUrl },
          rationale: ideal.includes(d)
            ? `${g.note}。予定上の候補日時です。店舗の空席と価格は予約サイトで確認してください。`
            : `推奨（${minD}〜${maxD}日前）から外れた候補日時です。店舗の空席と価格は予約サイトで確認してください。`,
          requiresBooking: true,
        });
        const label = g.label.split("（")[0];
        decisions.push({
          topic: `${label}の日時`,
          chosen: formatJst(taken.start),
          alternatives: order.filter((x) => x !== d).slice(0, 3).map((x) => `${x}日前`),
          reason: ideal.includes(d)
            ? `仕上がりが落ち着く推奨（${minD}〜${maxD}日前）の範囲で、カレンダーの予定と重ならない最初の空き時間です。`
            : `推奨（${minD}〜${maxD}日前）の日は空き時間がなかったため、いちばん近い日にしました。`,
        });
        break;
      }
    }
  }

  const eventStart = Date.parse(event.startAt);
  const arriveBy = eventStart - (event.arriveEarlyForGoods ? 180 : 90) * MS_MIN;
  const crowd = await call("estimate_crowd", { at: toJstIso(arriveBy) });
  decisions.push({
    topic: "現地に着く時刻",
    chosen: `${formatJst(toJstIso(arriveBy))} ごろ`,
    alternatives: event.arriveEarlyForGoods ? ["開演 90 分前（物販に間に合わない）", "開演直前（入場の列が最も混む）"] : ["開演直前（入場の列が最も混む）"],
    reason: `${event.arriveEarlyForGoods ? "物販に並ぶ時間を確保し、" : ""}混雑の予想（${crowd.summary}）をもとに、入場が集中する前に着くようにしました。`,
  });
  // 往路：所要時間の目安（アプリ内の表）で、着きたい時刻から出発の目安を逆算する
  const est = (await call("estimate_travel_time", { from_station: event.homeStation, to_station: event.venueStation, arrive_by: toJstIso(arriveBy) })).response as unknown as TravelEstimate;
  const departBy = est.available && est.departBy ? Date.parse(est.departBy) : NaN;
  if (Number.isFinite(departBy) && departBy > ctx.now) {
    items.push({
      id: "transit-out",
      kind: "transit",
      title: `${event.homeStation}から${event.venueStation}へ移動`,
      start: toJstIso(departBy),
      end: toJstIso(arriveBy),
      route: { from: event.homeStation, to: event.venueStation, summary: est.summary, legs: [], source: "estimate" },
      rationale: `${est.summary}。${formatJst(toJstIso(arriveBy))} ごろに会場へ着くよう、遅めの見積もりから出発の目安を決めました。乗る電車はリンクから確かめてください。`,
      requiresBooking: true,
    });
  }
  const checkAt = Math.max(ctx.now + MS_MIN, Math.min(eventStart - 15 * MS_MIN, eventStart - 24 * 60 * MS_MIN));
  items.push({
    id: "transit-check",
    kind: "prep",
    category: "transit-check",
    title: `${event.homeStation}から${event.venueStation}への電車を確認`,
    start: toJstIso(checkAt),
    end: toJstIso(checkAt + MS_MIN),
    provider: { name: "Google マップで乗り換えを検索", bookingUrl: transitSearchUrl(event.homeStation, event.venueStation) },
    rationale: est.available
      ? `移動の所要時間は目安です（${est.summary.replace(/^.*?：/, "")}）。乗る電車・運賃を確かめてください。`
      : `乗り換えの目安を出せませんでした。${formatJst(toJstIso(arriveBy))} ごろに会場へ着くことを目安に、乗る電車・かかる時間・運賃を確かめてください。`,
    requiresBooking: true,
  });

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
  await call("submit_timeline", {
    summary: `${event.title} に向けて、美容 ${items.filter((i) => i.kind === "beauty").length} 件の候補日時を選びました。移動のしかたと、泊まりが必要かどうかは乗り換え案内で確かめてください。`,
    items,
    warnings: ["サロンの空きや料金、移動のしかたはまだ確認できていません。予約の前に確かめてください。"],
    decisions,
  });
}

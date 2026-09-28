import "server-only";
import { BEAUTY_GUIDELINES } from "../services/beauty";
import { EKISPERT_ROUTE_URL } from "../safeUrl";
import { formatJst, MS_MIN, toJstIso } from "../time";
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
        break;
      }
    }
  }

  const eventStart = Date.parse(event.startAt);
  const arriveBy = eventStart - (event.arriveEarlyForGoods ? 180 : 90) * MS_MIN;
  await call("estimate_crowd", { at: toJstIso(arriveBy) });
  const checkAt = Math.max(ctx.now + MS_MIN, Math.min(eventStart - 15 * MS_MIN, eventStart - 24 * 60 * MS_MIN));
  items.push({
    id: "transit-check",
    kind: "prep",
    category: "transit-check",
    title: `${event.homeStation}から${event.venueStation}への移動を確認`,
    start: toJstIso(checkAt),
    end: toJstIso(checkAt + MS_MIN),
    provider: { name: "駅すぱあとで経路を検索", bookingUrl: EKISPERT_ROUTE_URL },
    rationale: `経路データを取得できていません。${formatJst(toJstIso(arriveBy))} 頃の現地到着を目安に、実際の列車・所要時間・運賃を確認してください。`,
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
  await call("submit_timeline", {
    summary: `${event.title} に向けて、美容 ${items.filter((i) => i.kind === "beauty").length} 件の候補日時を選びました。移動と宿泊の要否は経路検索で確認してください。`,
    items,
    warnings: ["実際のサロン空席・料金と移動経路は未取得です。予約前に確認してください。"],
  });
}

import "server-only";
import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { extractFreeSlots, overlapsBusy } from "../availability";
import type { BusyBlock } from "../privacy/mask";
import { BEAUTY_GUIDELINES, searchSalonSlots } from "../services/beauty";
import { callEkispertTool, EKISPERT_PREFIX } from "../services/ekispert";
import { searchSpots, SPOT_CATEGORIES, SPOT_CATEGORY_LABEL, type SpotCategory } from "../services/spots";
import { estimateCrowd } from "../services/transit";
import { getForecast, jstDateKey, type Forecast } from "../signals/weather";
import { jstAt, MS_DAY, MS_MIN, toJstIso } from "../time";
import { validateSummary, validateTimeline } from "./validate";
import { BEAUTY_SERVICES, DecisionSchema, TimelineItemSchema, type Decision, type OshiEvent, type SkinAnalysis, type TimelineItem } from "./types";

/** 1 リクエスト分のエージェント実行コンテキスト（メモリ上のみ・リクエスト終了で破棄） */
export interface AgentContext {
  event: OshiEvent;
  busy: readonly BusyBlock[];
  skin?: SkinAnalysis;
  now: number;
  submitted?: { summary: string; items: TimelineItem[]; warnings: string[]; decisions: Decision[] };
  rejectedSubmissions: number;
  ekispertSucceeded?: boolean;
  /** 公演日の天気。エージェントが調べた場合だけ入り、検証にも使う */
  forecast?: Forecast;
  /** 会場のエリア（都道府県）。天気・立ち寄り先の検索キー */
  venueArea?: string;
  /** 直前の差し戻しの内容。同じ指摘が続いたら AI に任せず仕上げる */
  lastRejection?: string;
}

const ISO = { type: "string", description: "ISO 8601 日時（例: 2026-10-27T11:00:00+09:00）" } as const;
const DATE = { type: "string", description: "日付 YYYY-MM-DD（JST）" } as const;

/**
 * Gemini に公開するツール。**予約・決済・カレンダー書き込みのツールは意図的に存在しない。**
 * エージェントは「調べる」「提案を提出する」ことしかできず、実行はユーザー承認後にサーバーが行う。
 */
export const NATIVE_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_free_time_slots",
    description:
      "ユーザーのカレンダーから算出した空き時間（予定の内容はマスク済みで時間帯のみ）を返す。美容サロンや移動を入れられる時間帯を探すのに使う。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        from_date: DATE,
        to_date: DATE,
        min_minutes: { type: "integer", description: "最低限必要な連続空き時間（分）", minimum: 15, maximum: 720 },
        day_start_hour: { type: "integer", minimum: 0, maximum: 23 },
        day_end_hour: { type: "integer", minimum: 1, maximum: 24 },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "get_beauty_guideline",
    description: "美容メニューごとの推奨タイミング（イベント何日前が理想か）と所要時間の目安を返す。",
    parametersJsonSchema: {
      type: "object",
      properties: { service: { type: "string", enum: [...BEAUTY_SERVICES] } },
      required: ["service"],
    },
  },
  {
    name: "search_beauty_salons",
    description:
      "美容施術を入れられる候補日時を計算する。店舗の実際の空席や価格は取得できない。予約サイトで確認が必要。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        service: { type: "string", enum: [...BEAUTY_SERVICES] },
        station: { type: "string", description: "サロンを探す最寄り駅（通常はユーザーの自宅最寄り）" },
        window_start: ISO,
        window_end: ISO,
      },
      required: ["service", "station", "window_start", "window_end"],
    },
  },
  {
    name: "get_skin_analysis",
    description: "YouCam AI 肌解析の結果（スコアとアドバイス）を返す。ユーザーが画像を提供していない場合は provided=false。",
    // 引数なし。空の object（properties: {}）を書くと Vertex AI が 400 INVALID_ARGUMENT で拒否するため、定義ごと省く
  },
  {
    name: "estimate_crowd",
    description: "会場最寄り駅の指定時刻の混雑度を推定する。混雑を避けた到着時刻を決めるのに使う。",
    parametersJsonSchema: { type: "object", properties: { at: ISO }, required: ["at"] },
  },
  {
    name: "get_weather_forecast",
    description:
      "公演日の天気（気象庁）を返す。雨・雪ならヘアセットの時間帯や持ち物、屋外での待機時間の判断に使う。公演が1週間以上先だと available=false になる。",
    parametersJsonSchema: {
      type: "object",
      properties: { date: DATE },
    },
  },
  {
    name: "search_nearby_spots",
    description:
      "会場周辺で空き時間に立ち寄れる場所（ご当地グルメ・写真を撮れる場所・座って待てる場所）を探す。開演前や終演後にまとまった時間があるときだけ使う。営業時間は未取得なので、プランには確認を促す一文を添えること。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        available_minutes: { type: "integer", description: "立ち寄りに使える時間（分）", minimum: 20, maximum: 480 },
        category: { type: "string", enum: [...SPOT_CATEGORIES], description: "省略すると全種類" },
        indoor_only: { type: "boolean", description: "雨・雪のときは true にする" },
      },
      required: ["available_minutes"],
    },
  },
  {
    name: "search_transit_route_mock",
    description:
      "駅すぱあとが使えないときだけ使う。経路データが取得できないことを返す。具体的な列車・所要時間・運賃は生成しない。",
    parametersJsonSchema: {
      type: "object",
      properties: { from_station: { type: "string" }, to_station: { type: "string" }, arrive_by: ISO },
      required: ["from_station", "to_station", "arrive_by"],
    },
  },
  {
    name: "submit_timeline",
    description:
      "完成したタイムラインを提出する。サーバー側で検証され、問題があれば errors が返るので修正して再提出すること。受理されるとユーザーの承認待ち（pending_approval）になる。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "プラン全体の要約（日本語・200字以内）" },
        decisions: {
          type: "array",
          maxItems: 5,
          description: "主な判断の記録。ユーザーに根拠として表示する（例: ヘアカットの日時、現地到着時刻）",
          items: {
            type: "object",
            properties: {
              topic: { type: "string", description: "何を決めたか（例: ヘアカットの日時）" },
              chosen: { type: "string", description: "選んだもの（例: 10/27(火) 11:00）" },
              alternatives: { type: "array", maxItems: 3, items: { type: "string" }, description: "比べたが選ばなかった候補" },
              reason: { type: "string", description: "選んだ理由（ツールで確かめた事実にもとづく）" },
            },
            required: ["topic", "chosen", "reason"],
          },
        },
        warnings: { type: "array", items: { type: "string" }, description: "ユーザーに伝えるべき注意点" },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "一意な ID（例: brow-1, transit-out）" },
              kind: { type: "string", enum: ["beauty", "transit", "prep", "stay", "event", "spot"] },
              category: { type: "string", description: "beauty の場合は brow/hair/nail/eyelash/skincare、spot の場合は gourmet/photo/rest、それ以外は train/hotel/goods/selfcare など" },
              title: { type: "string" },
              start: ISO,
              end: ISO,
              location: { type: "string" },
              provider: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  priceJpy: { type: "integer" },
                  bookingUrl: { type: "string" },
                  slotId: { type: "string" },
                },
                required: ["name"],
              },
              route: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  summary: { type: "string" },
                  fareJpy: { type: "integer" },
                  source: { type: "string", enum: ["ekispert", "mock"] },
                  legs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        line: { type: "string" },
                        from: { type: "string" },
                        to: { type: "string" },
                        departure: { type: "string" },
                        arrival: { type: "string" },
                      },
                      required: ["line", "from", "to"],
                    },
                  },
                },
                required: ["from", "to", "summary", "source"],
              },
              rationale: { type: "string", description: "この時間・内容にした理由（ユーザーに表示）" },
              requiresBooking: { type: "boolean", description: "予約が必要なら true（サロン・新幹線・ホテル等）" },
            },
            required: ["id", "kind", "title", "start", "end", "rationale", "requiresBooking"],
          },
        },
      },
      required: ["summary", "items"],
    },
  },
];

export const NATIVE_TOOL_NAMES = new Set(NATIVE_DECLARATIONS.map((d) => d.name!));

const SubmitSchema = z.object({
  summary: z.string().max(400),
  decisions: z.array(DecisionSchema).max(6).default([]),
  warnings: z.array(z.string().max(200)).max(10).default([]),
  items: z.array(TimelineItemSchema).min(1).max(20),
});

const str = (v: unknown, max = 60) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export interface ToolOutcome {
  response: Record<string, unknown>;
  ok: boolean;
  summary: string; // トレース表示用（個人情報を含めない）
  done?: boolean;
}

/**
 * ツール実行ディスパッチャ。許可リストにないツール名は実行しない（ガードレール）。
 */
export async function executeTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  switch (name) {
    case "get_free_time_slots": {
      const fromKey = str(args.from_date, 10);
      const toKey = str(args.to_date, 10);
      const from = Math.max(ctx.now, Date.parse(`${fromKey}T00:00:00+09:00`) || ctx.now);
      const to = Math.min(Date.parse(ctx.event.startAt), (Date.parse(`${toKey}T00:00:00+09:00`) || ctx.now) + MS_DAY);
      const slots = extractFreeSlots(ctx.busy, {
        from,
        to,
        minMinutes: num(args.min_minutes, 60),
        dayStartHour: num(args.day_start_hour, 9),
        dayEndHour: num(args.day_end_hour, 21),
      }).slice(0, 40);
      return { ok: true, response: { slots, note: "予定の内容は非公開。時間帯のみ" }, summary: `${fromKey.slice(5).replace("-", "/")}〜${toKey.slice(5).replace("-", "/")} の空き時間を ${slots.length} 件見つけました` };
    }
    case "get_beauty_guideline": {
      const svc = str(args.service, 20) as keyof typeof BEAUTY_GUIDELINES;
      const g = BEAUTY_GUIDELINES[svc];
      if (!g) return { ok: false, response: { error: "unknown service" }, summary: "対応していないメニューでした" };
      return { ok: true, response: { service: svc, ...g }, summary: `${g.label}は${g.idealDaysBefore[0]}〜${g.idealDaysBefore[1]}日前がおすすめ` };
    }
    case "search_beauty_salons": {
      const svc = str(args.service, 20) as keyof typeof BEAUTY_GUIDELINES;
      if (!BEAUTY_GUIDELINES[svc]) return { ok: false, response: { error: "unknown service" }, summary: "対応していないメニューでした" };
      const slots = searchSalonSlots({
        service: svc,
        station: str(args.station, 40) || ctx.event.homeStation,
        windowStart: str(args.window_start, 40),
        windowEnd: str(args.window_end, 40),
        limit: 100,
      }).filter((s) => !overlapsBusy(ctx.busy, Date.parse(s.start), Date.parse(s.end), 15) && Date.parse(s.start) > ctx.now);
      return {
        ok: true,
        response: { slots: slots.slice(0, 6), source: "calendar-candidates", note: "店舗の空席や価格は未確認。予約サイトで確認してください" },
        summary: `${BEAUTY_GUIDELINES[svc].label.split("（")[0]}の候補日時を ${Math.min(slots.length, 6)} 件見つけました（店舗の空席は未確認）`,
      };
    }
    case "get_skin_analysis":
      return ctx.skin
        ? { ok: true, response: { provided: true, ...ctx.skin }, summary: "肌診断の結果を参考にしました" }
        : { ok: true, response: { provided: false }, summary: "肌診断はなし" };
    case "estimate_crowd": {
      const r = estimateCrowd({ eventStart: ctx.event.startAt, at: str(args.at, 40) });
      return { ok: true, response: r, summary: `開演${r.minutesBeforeStart}分前の混み具合: ${r.level === "high" ? "とても混雑" : r.level === "medium" ? "やや混雑" : "比較的空いている"}` };
    }
    case "get_weather_forecast": {
      if (!ctx.venueArea) {
        return { ok: true, response: { available: false, reason: "会場のエリアが特定できていません" }, summary: "会場のエリアが分からず、天気は調べられませんでした" };
      }
      const date = str(args.date, 10) || jstDateKey(ctx.event.startAt);
      const f = await getForecast(ctx.venueArea, `${date}T12:00:00+09:00`, ctx.now);
      if (!f) {
        return {
          ok: true,
          response: { available: false, reason: "予報の範囲外（公演が先すぎる）か、取得できませんでした。天気は断定しないこと" },
          summary: "公演日の天気はまだ分かりませんでした",
        };
      }
      // 検証で使うため、提出前の文脈に残す
      if (date === jstDateKey(ctx.event.startAt)) ctx.forecast = f;
      const label = { clear: "晴れ", cloudy: "くもり", rain: "雨", snow: "雪" }[f.sky];
      return {
        ok: true,
        response: { available: true, date: f.date, sky: f.sky, text: f.text, needsRainGear: f.needsRainGear, source: "気象庁" },
        summary: `${f.date.slice(5).replace("-", "/")}の${ctx.venueArea}は${label}の予報です`,
      };
    }
    case "search_nearby_spots": {
      if (!ctx.venueArea) {
        return { ok: true, response: { spots: [], reason: "会場のエリアが特定できていません" }, summary: "会場のエリアが分からず、立ち寄り先は探せませんでした" };
      }
      const category = str(args.category, 10);
      const spots = searchSpots({
        area: ctx.venueArea,
        availableMinutes: num(args.available_minutes, 60),
        category: (SPOT_CATEGORIES as readonly string[]).includes(category) ? (category as SpotCategory) : undefined,
        // 雨・雪を調べ済みなら、明示されなくても屋内に寄せる
        indoorOnly: args.indoor_only === true || ctx.forecast?.needsRainGear === true,
      }).slice(0, 5);
      return {
        ok: true,
        response: {
          spots: spots.map((s) => ({ ...s, categoryLabel: SPOT_CATEGORY_LABEL[s.category] })),
          note: "営業時間・定休日は未取得。立ち寄る前に確認するよう案内すること",
        },
        summary: spots.length
          ? `${ctx.venueArea}で立ち寄れる場所を ${spots.length} 件見つけました`
          : "その時間で立ち寄れる場所は見つかりませんでした",
      };
    }
    case "search_transit_route_mock": {
      // 経路は作らず「調べられない」ことだけを返す。失敗ではなく想定どおりの結果なので、画面では ✗ にしない
      return {
        ok: true,
        response: { unavailable: true, note: "経路・所要時間・運賃は未取得。kind=prep, category=transit-check の確認項目を入れる（検索リンクはアプリが付ける）" },
        summary: "乗り換えは、出発駅と会場の駅を入れた検索リンクでご案内します（時刻は決めていません）",
      };
    }
    case "submit_timeline": {
      const parsed = SubmitSchema.safeParse(args);
      if (!parsed.success) {
        ctx.rejectedSubmissions++;
        const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { ok: false, response: { accepted: false, errors: issues }, summary: `見直す点が見つかったので作り直します（${issues.length}件）` };
      }
      const { errors, warnings } = validateTimeline(parsed.data.items, ctx.event, ctx.busy, ctx.now, ctx.forecast);
      errors.push(...validateSummary(parsed.data.summary));
      if (parsed.data.items.some((item) => item.route?.source === "ekispert") && !ctx.ekispertSucceeded) {
        errors.push("駅すぱあとから経路を取得していません。実経路として表示せず、確認手順を入れてください");
      }
      if (errors.length > 0) {
        const key = [...errors].sort().join("\n");
        const repeated = ctx.lastRejection === key;
        ctx.lastRejection = key;
        // 同じ指摘で 2 回続けて差し戻されたら、AI には直せないと判断し、問題の項目を外して仕上げる
        const repaired = repeated && !errors.some((e) => e.startsWith("summary")) ? repairTimeline(parsed.data.items, errors, ctx) : undefined;
        if (repaired) {
          ctx.submitted = {
            summary: parsed.data.summary,
            items: repaired.items,
            warnings: [...parsed.data.warnings, ...repaired.warnings, ...repaired.notes],
            decisions: parsed.data.decisions,
          };
          return {
            ok: true,
            done: true,
            response: { accepted: true, status: "pending_approval" },
            summary: `同じ点を AI が直せなかったため、${repaired.notes.length} 件を調整して仕上げました（内容はプランの注意書きを確認してください）`,
          };
        }
        ctx.rejectedSubmissions++;
        return {
          ok: false,
          response: { accepted: false, errors, hint: "errors を解消して submit_timeline を再度呼び出してください。同じ内容で出し直さず、指摘された項目の時刻を変えるか、外してください" },
          summary: `見直す点が見つかったので作り直します（${errors.length}件）：${displayError(errors[0])}`,
        };
      }
      ctx.lastRejection = undefined;
      ctx.submitted = { summary: parsed.data.summary, items: parsed.data.items, warnings: [...parsed.data.warnings, ...warnings], decisions: parsed.data.decisions };
      return { ok: true, done: true, response: { accepted: true, status: "pending_approval" }, summary: `スケジュール ${parsed.data.items.length} 件が完成しました` };
    }
    default:
      if (name.startsWith(EKISPERT_PREFIX)) {
        const r = (await callEkispertTool(name, args)) as Record<string, unknown>;
        if (!r.error && !r.isError) ctx.ekispertSucceeded = true;
        return { ok: !r.error && !r.isError, response: r, summary: r.error ? "乗換案内に接続できませんでした" : "乗換案内でルートを調べました" };
      }
      return { ok: false, response: { error: `tool ${name} is not allowed` }, summary: "安全のため、許可されていない操作は実行しませんでした" };
  }
}

/** 差し戻しの理由を、画面に出せる短い文にする（内部の ID は省く） */
function displayError(error: string): string {
  const text = error.replace(/[\w-]+（/g, "（").replace(/^[\w-]+: /, "");
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

/**
 * AI が同じ指摘を直せなかったときの仕上げ。
 * - 指摘された項目のうち、公演と移動以外（美容・立ち寄り・準備）を外す
 * - 移動の確認や雨対策が足りないという指摘には、確認の項目を足す
 * 直した結果をもう一度検査し、問題がなくなったときだけ使う（直せなければ undefined）
 */
export function repairTimeline(items: TimelineItem[], errors: string[], ctx: AgentContext): { items: TimelineItem[]; warnings: string[]; notes: string[] } | undefined {
  const notes: string[] = [];
  const named = new Set(items.filter((it) => errors.some((e) => e.startsWith(`${it.id}:`) || e.includes(`${it.id}（`))).map((it) => it.id));
  let next = items.filter((it) => {
    if (!named.has(it.id) || it.kind === "event" || it.kind === "transit") return true;
    notes.push(`「${it.title}」は時間が合わなかったため外しました。必要なら「AIに相談して直す」から追加してください`);
    return false;
  });
  const eventStart = Date.parse(ctx.event.startAt);
  const at = (msBeforeEvent: number) => Math.max(ctx.now + 10 * MS_MIN, eventStart - msBeforeEvent);
  if (errors.some((e) => e.startsWith("移動経路"))) {
    const s = at(24 * 60 * MS_MIN);
    next = [...next, {
      id: "transit-check-auto", kind: "prep", category: "transit-check",
      title: `${ctx.event.homeStation}から${ctx.event.venueStation}への移動を確認`,
      start: toJstIso(s), end: toJstIso(s + 15 * MS_MIN),
      rationale: "乗り換えの情報はまだ調べられていません。開演に余裕をもって着く電車・かかる時間・運賃を確かめてください。",
      requiresBooking: false,
    }];
    notes.push("移動の確認の項目を追加しました");
  }
  if (errors.some((e) => e.startsWith("公演日は雨・雪"))) {
    const s = at(6 * 60 * MS_MIN);
    next = [...next, {
      id: "rain-gear-auto", kind: "prep", category: "selfcare",
      title: "雨・雪の対策（傘・濡れ対策）を準備",
      start: toJstIso(s), end: toJstIso(s + 15 * MS_MIN),
      rationale: "公演日は雨・雪の予報です。傘と、ヘアセットが濡れないための対策を持って出かけてください。",
      requiresBooking: false,
    }];
    notes.push("雨・雪の対策の項目を追加しました");
  }
  if (next.length === items.length && notes.length === 0) return undefined;
  const check = validateTimeline(next, ctx.event, ctx.busy, ctx.now, ctx.forecast);
  if (check.errors.length > 0) return undefined;
  return { items: next, warnings: check.warnings, notes };
}

/** ルールベース用: イベント日から days 日前の JST 日付の hour 時 */
export const daysBefore = (eventIso: string, days: number, hour: number) => {
  const key = new Date(Date.parse(eventIso) - days * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
  return jstAt(key, hour);
};

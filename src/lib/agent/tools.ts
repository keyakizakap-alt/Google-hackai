import "server-only";
import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { extractFreeSlots, overlapsBusy } from "../availability";
import type { BusyBlock } from "../privacy/mask";
import { BEAUTY_GUIDELINES, searchSalonSlots } from "../services/beauty";
import { callEkispertTool, EKISPERT_PREFIX } from "../services/ekispert";
import { estimateCrowd, mockRoute } from "../services/transit";
import { jstAt, MS_DAY } from "../time";
import { validateTimeline } from "./validate";
import { BEAUTY_SERVICES, TimelineItemSchema, type OshiEvent, type SkinAnalysis, type TimelineItem } from "./types";

/** 1 リクエスト分のエージェント実行コンテキスト（メモリ上のみ・リクエスト終了で破棄） */
export interface AgentContext {
  event: OshiEvent;
  busy: readonly BusyBlock[];
  skin?: SkinAnalysis;
  now: number;
  submitted?: { summary: string; items: TimelineItem[]; warnings: string[] };
  rejectedSubmissions: number;
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
      "指定駅周辺の美容サロンの空き枠を検索する。カレンダーの既存予定と重なる枠は除外済み。予約はしない（検索のみ）。",
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
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "estimate_crowd",
    description: "会場最寄り駅の指定時刻の混雑度を推定する。混雑を避けた到着時刻を決めるのに使う。",
    parametersJsonSchema: { type: "object", properties: { at: ISO }, required: ["at"] },
  },
  {
    name: "search_transit_route_mock",
    description:
      "経路の概算（モック）。駅すぱあと API（ekispert_ で始まるツール）が利用できない、または失敗した場合のみ使う。",
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
        warnings: { type: "array", items: { type: "string" }, description: "ユーザーに伝えるべき注意点" },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "一意な ID（例: brow-1, transit-out）" },
              kind: { type: "string", enum: ["beauty", "transit", "prep", "stay", "event"] },
              category: { type: "string", description: "beauty の場合は brow/hair/nail/eyelash/skincare、それ以外は train/hotel/goods/selfcare など" },
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
        limit: 12,
      }).filter((s) => !overlapsBusy(ctx.busy, Date.parse(s.start), Date.parse(s.end), 15) && Date.parse(s.start) > ctx.now);
      return {
        ok: true,
        response: { slots: slots.slice(0, 6), source: "mock", note: "予約はまだ行われていません" },
        summary: `${BEAUTY_GUIDELINES[svc].label.split("（")[0]}の空きを ${Math.min(slots.length, 6)} 件見つけました`,
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
    case "search_transit_route_mock": {
      const r = mockRoute({
        from: str(args.from_station, 40) || ctx.event.homeStation,
        to: str(args.to_station, 40) || ctx.event.venueStation,
        arriveBy: str(args.arrive_by, 40) || new Date(Date.parse(ctx.event.startAt) - 2 * 3600_000).toISOString(),
      });
      return { ok: true, response: r as unknown as Record<string, unknown>, summary: `移動ルート（目安）約${Math.floor(r.durationMin / 60)}時間${r.durationMin % 60}分・乗り換え${r.transfers}回` };
    }
    case "submit_timeline": {
      const parsed = SubmitSchema.safeParse(args);
      if (!parsed.success) {
        ctx.rejectedSubmissions++;
        const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { ok: false, response: { accepted: false, errors: issues }, summary: `内容に不備があったため作り直します（${issues.length}件）` };
      }
      const { errors, warnings } = validateTimeline(parsed.data.items, ctx.event, ctx.busy, ctx.now);
      if (errors.length > 0) {
        ctx.rejectedSubmissions++;
        return {
          ok: false,
          response: { accepted: false, errors, hint: "errors を解消して submit_timeline を再度呼び出してください" },
          summary: `予定の重なりなどが見つかったため作り直します（${errors.length}件）`,
        };
      }
      ctx.submitted = { summary: parsed.data.summary, items: parsed.data.items, warnings: [...parsed.data.warnings, ...warnings] };
      return { ok: true, done: true, response: { accepted: true, status: "pending_approval" }, summary: `スケジュール ${parsed.data.items.length} 件が完成しました` };
    }
    default:
      if (name.startsWith(EKISPERT_PREFIX)) {
        const r = (await callEkispertTool(name, args)) as Record<string, unknown>;
        return { ok: !r.error && !r.isError, response: r, summary: r.error ? "乗換案内に接続できませんでした" : "乗換案内でルートを調べました" };
      }
      return { ok: false, response: { error: `tool ${name} is not allowed` }, summary: "安全のため、許可されていない操作は実行しませんでした" };
  }
}

/** ルールベース用: イベント日から days 日前の JST 日付の hour 時 */
export const daysBefore = (eventIso: string, days: number, hour: number) => {
  const key = new Date(Date.parse(eventIso) - days * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
  return jstAt(key, hour);
};

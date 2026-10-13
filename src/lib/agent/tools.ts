import "server-only";
import type { FunctionDeclaration } from "@google/genai";
import { config } from "../config";
import { z } from "zod";
import { extractFreeSlots, overlapsBusy } from "../availability";
import type { BusyBlock } from "../privacy/mask";
import { BEAUTY_GUIDELINES, searchSalonSlots } from "../services/beauty";
import { callEkispertTool, EKISPERT_PREFIX } from "../services/ekispert";
import { searchSpots, SPOT_CATEGORIES, SPOT_CATEGORY_LABEL, type SpotCategory } from "../services/spots";
import { estimateCrowd } from "../services/transit";
import { estimateTravel, type TravelEstimate } from "../services/travelEstimate";
import { searchWeb } from "../services/webSearch";
import { getForecast, jstDateKey, type Forecast } from "../signals/weather";
import { jstAt, MS_DAY, MS_MIN, toJstIso } from "../time";
import { validateSummary, validateTimeline, webEvidenceOf } from "./validate";
import { BEAUTY_SERVICES, DecisionSchema, TimelineItemSchema, WEB_SEARCH_PURPOSES, type Decision, type OshiEvent, type TimelineItem, type WebSearchPurpose, type WebSearchRecord } from "./types";

/** 1 リクエスト分のエージェント実行コンテキスト（メモリ上のみ・リクエスト終了で破棄） */
export interface AgentContext {
  event: OshiEvent;
  busy: readonly BusyBlock[];
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
  /** Google 検索の結果（この回と、作り直す前のプランのもの）。名前・価格の照合と、画面の出典に使う */
  webSearches?: WebSearchRecord[];
  /** この回のプラン作成で Google 検索を使った回数（上限は config.gemini.webSearchMaxPerPlan） */
  webSearchCount?: number;
  /** ログをつなぐための ID */
  requestId?: string;
}

/** Google 検索の道具の名前（設定で止めたときは AI に渡さない） */
export const WEB_SEARCH_TOOL = "search_web";

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
    name: "estimate_travel_time",
    description:
      "出発駅から会場の駅までの所要時間の目安（分の幅・主な手段）と、arrive_by に間に合う出発の目安を返す。アプリ内の表による目安で、列車名・発着時刻・運賃は返さない。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        from_station: { type: "string", description: "出発駅（通常はユーザーの出発駅）" },
        to_station: { type: "string", description: "会場の最寄り駅" },
        arrive_by: { ...ISO, description: "会場の駅に着きたい時刻（ISO 8601）" },
      },
      required: ["from_station", "to_station", "arrive_by"],
    },
  },
  {
    name: WEB_SEARCH_TOOL,
    description:
      "Google 検索で、実在の美容サロン・宿泊施設・飛行機の便と、価格の目安を探す。1 回のプラン作成で使える回数に上限がある（使い切ると available=false）。" +
      "空席・予約できるかは分からない。結果の text に書かれた名前・便名・価格だけを使い、出典は sources の uri をそのまま sourceUrl に入れる。",
    parametersJsonSchema: {
      type: "object",
      properties: {
        purpose: { type: "string", enum: [...WEB_SEARCH_PURPOSES], description: "beauty_salon=美容サロン、hotel=宿、flight=飛行機の便" },
        query: { type: "string", description: "検索の条件（例: 長崎駅 近く 眉毛サロン／京セラドーム大阪 近く ホテル 12月19日／福岡空港 羽田空港 12月19日 午前 便 運賃）" },
      },
      required: ["purpose", "query"],
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
                  sourceUrl: { type: "string", description: "search_web で見つけた店舗・宿のときだけ、出典（sources の uri）をそのまま入れる" },
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
                  source: { type: "string", enum: ["ekispert", "estimate", "web"], description: "ekispert は駅すぱあとで実際に調べた経路、estimate は estimate_travel_time などの所要時間の目安、web は search_web で見つけた便（飛行機など）" },
                  sourceUrl: { type: "string", description: "source が web のときだけ、出典（sources の uri）をそのまま入れる" },
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
    case "estimate_travel_time": {
      // 待機系：アプリ内の表で所要時間の目安を出す（駅すぱあとが使えないとき）。目安が出なくても失敗ではない
      const est = travelEstimateFor(ctx, str(args.from_station, 40), str(args.to_station, 40), str(args.arrive_by, 40));
      return {
        ok: true,
        response: est.available
          ? { ...est, howToUse: ESTIMATE_HOW_TO_USE }
          : { ...est, howToUse: "目安を出せなかった。kind=prep, category=transit-check の確認項目を入れる（検索リンクはアプリが付ける）" },
        summary: est.available ? `移動の目安：${est.summary.replace(/^.*?：/, "")}` : "乗り換えの目安を出せなかったため、検索リンクでご案内します",
      };
    }
    case WEB_SEARCH_TOOL: {
      const purpose = str(args.purpose, 20) as WebSearchPurpose;
      const query = str(args.query, 120).trim();
      if (!(WEB_SEARCH_PURPOSES as readonly string[]).includes(purpose) || !query) {
        return { ok: false, response: { error: "purpose と query が必要です" }, summary: "検索の条件が足りませんでした" };
      }
      // 費用を抑えるため、1 回のプラン作成で使える回数を決めている
      if ((ctx.webSearchCount ?? 0) >= config.gemini.webSearchMaxPerPlan) {
        return {
          ok: true,
          response: { available: false, reason: "このプランで使える Google 検索の回数を使い切りました。これまでの結果か、候補日時の案内で組み立ててください" },
          summary: "Google 検索の回数の上限に達したため、これまでの結果で組み立てます",
        };
      }
      ctx.webSearchCount = (ctx.webSearchCount ?? 0) + 1;
      const r = await searchWeb(purpose, query, { requestId: ctx.requestId });
      const what = { beauty_salon: "美容サロン", hotel: "宿", flight: "飛行機の便" }[purpose];
      if (!r.available || !r.record) {
        return {
          ok: true,
          response: { available: false, reason: r.reason, howToUse: "検索で見つからなかったので、店舗名・便名・価格は書かない。今までどおり候補日時や目安で組み立てる" },
          summary: `Google 検索で${what}を探しましたが、見つかりませんでした`,
        };
      }
      ctx.webSearches = [...(ctx.webSearches ?? []), r.record];
      return {
        ok: true,
        response: {
          available: true,
          text: r.record.text,
          sources: r.record.sources.map((s) => ({ title: s.title, uri: s.uri })),
          howToUse: WEB_HOW_TO_USE[purpose],
        },
        summary: `Google 検索で${what}を探しました（出典 ${r.record.sources.length} 件）`,
      };
    }
    case "submit_timeline": {
      const parsed = SubmitSchema.safeParse(args);
      if (!parsed.success) {
        ctx.rejectedSubmissions++;
        // 形式の誤りを挟んだら「同じ指摘が続いた」とは数えない
        ctx.lastRejection = undefined;
        const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { ok: false, response: { accepted: false, errors: issues }, summary: `見直す点が見つかったので作り直します（${issues.length}件）` };
      }
      const { errors, warnings } = checkSubmission(parsed.data.items, parsed.data.summary, ctx);
      if (errors.length > 0) {
        const key = [...errors].sort().join("\n");
        const repeated = ctx.lastRejection === key;
        ctx.lastRejection = key;
        // 同じ指摘で 2 回続けて差し戻されたら、AI には直せないと判断し、問題の項目を外して仕上げる
        const repaired = repeated && !errors.some((e) => e.startsWith("summary")) ? repairTimeline(parsed.data.items, errors, ctx) : undefined;
        if (repaired) {
          const mentionsRemoved = (text: string) => repaired.removed.some((r) => r.keywords.some((k) => text.includes(k)));
          const removedTitles = repaired.removed.map((r) => `「${r.title}」`).join("・");
          ctx.submitted = {
            summary: removedTitles ? `${parsed.data.summary}（時間が合わなかった${removedTitles}は外しました）`.slice(0, 400) : parsed.data.summary,
            items: repaired.items,
            warnings: [...parsed.data.warnings, ...repaired.warnings, ...repaired.notes],
            decisions: parsed.data.decisions.filter((d) => !mentionsRemoved(`${d.topic} ${d.chosen}`)),
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
        if (!r.error && !r.isError) {
          ctx.ekispertSucceeded = true;
          return { ok: true, response: r, summary: "乗換案内でルートを調べました" };
        }
        // フェールオーバー：主系（駅すぱあと）が答えられなかったら、待機系（所要時間の目安）をその場で計算して渡す。
        // 失敗した検索の向き（往路・帰り）と時刻を引数から読み取り、同じ移動の目安にする
        const fallback = failoverEstimate(ctx, args);
        return {
          ok: true,
          response: {
            ...r,
            fallback: fallback.available ? fallback : undefined,
            note: fallback.available
              ? `駅すぱあとで調べられなかったため、fallback（${fallback.direction}の所要時間の目安）で、この移動だけを組み立てる（route.source は estimate）`
              : "駅すぱあとで調べられなかった。kind=prep, category=transit-check の確認項目を入れる",
          },
          summary: fallback.available ? "乗り換え案内に接続できなかったため、所要時間の目安に切り替えました" : "乗り換え案内に接続できなかったため、検索リンクでご案内します",
        };
      }
      return { ok: false, response: { error: `tool ${name} is not allowed` }, summary: "安全のため、許可されていない操作は実行しませんでした" };
  }
}

/** 提出されたプランの検査（タイムライン・要約の書き方・駅すぱあとの経路の出どころ） */
function checkSubmission(items: TimelineItem[], summary: string, ctx: AgentContext): { errors: string[]; warnings: string[] } {
  const { errors, warnings } = validateTimeline(items, ctx.event, ctx.busy, ctx.now, ctx.forecast, webEvidenceOf(ctx.webSearches));
  errors.push(...validateSummary(summary));
  if (items.some((item) => item.route?.source === "ekispert") && !ctx.ekispertSucceeded) {
    errors.push("駅すぱあとから経路を取得していません。実経路として表示せず、確認手順を入れてください");
  }
  return { errors, warnings };
}

/** Google 検索の結果の使い方（AI への説明） */
const WEB_HOW_TO_USE: Record<WebSearchPurpose, string> = {
  beauty_salon:
    "店舗を入れるときは kind=beauty の provider.name に text に書かれた店舗名（1 行に 1 件。価格はその店舗の行のもの）、provider.sourceUrl にその店舗が載っている sources の uri、価格が書かれていれば provider.priceJpy（検索時点の参考）を入れる。日時は search_beauty_salons の候補から選ぶ。空席は分からないので「予約サイトで空きを確認」と rationale に書く",
  hotel:
    "宿を入れるときは kind=stay の provider.name に text に書かれた施設名、provider.sourceUrl に sources の uri、価格が書かれていれば provider.priceJpy（検索時点の参考）を入れる。空室は分からないので確認を促す",
  flight:
    "便を入れるときは kind=transit, category=flight, route.source=web, route.sourceUrl に sources の uri、legs に text の同じ行に書かれた便名（line）・出発空港（from）・到着空港（to）・出発時刻（departure、必須）・到着時刻（arrival）を ISO 形式で入れる。運賃が書かれていれば route.fareJpy（検索時点の参考）。空席は分からないので確認を促す。空港までの移動は別の項目（目安）で入れる",
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 所要時間の目安の使い方（AI への説明） */
const ESTIMATE_HOW_TO_USE =
  "往路を kind=transit・route.source=estimate・legs は空・fareJpy なしで入れ、start は departBy ごろ、end は着きたい時刻にする。route.summary にこの目安の要約を書く。列車名・発着時刻・運賃は書かない";

/** 会場の駅に着きたい時刻の既定（物販に並ぶなら開演 2 時間半前、そうでなければ 1 時間前） */
function defaultArriveBy(event: OshiEvent): string {
  return toJstIso(Date.parse(event.startAt) - (event.arriveEarlyForGoods ? 150 : 60) * MS_MIN);
}

/** 引数の中の ISO 形式の日時（最初に見つかったもの） */
function firstIsoIn(args: Record<string, unknown>): number | undefined {
  for (const v of Object.values(args)) {
    if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v))) return Date.parse(v);
  }
  return undefined;
}

/**
 * 駅すぱあとの呼び出しが失敗したときの代わりの目安。
 * 引数で会場の駅が自宅の駅より先に出てくる・開演より後の時刻が指定されている場合は帰りとみなし、所要時間だけを返す。
 * 往路は、指定された時刻（なければ既定）に着くための出発の目安も返す
 */
function failoverEstimate(ctx: AgentContext, args: Record<string, unknown>): TravelEstimate & { direction: "往路" | "帰り"; howToUse: string } {
  const text = JSON.stringify(args);
  const { homeStation, venueStation } = ctx.event;
  const iHome = text.indexOf(homeStation);
  const iVenue = text.indexOf(venueStation);
  const at = firstIsoIn(args);
  const isReturn = (iHome >= 0 && iVenue >= 0 && iVenue < iHome) || (at !== undefined && at >= Date.parse(ctx.event.startAt));
  if (isReturn) {
    // 所要時間は往復で同じとみなし、往路の目安の向きだけを入れ替える（会場名は会場側の地域の判定に使うため）
    const out = estimateTravel({ from: homeStation, to: venueStation, venue: ctx.event.venue });
    const summary = out.available ? out.summary.replace(`${homeStation} → ${venueStation}`, `${venueStation} → ${homeStation}`) : out.summary;
    return {
      ...out,
      from: venueStation,
      to: homeStation,
      departBy: undefined,
      summary,
      direction: "帰り",
      howToUse: "帰りの所要時間の目安（出発の時刻は決めていない）。帰りを入れる場合は kind=transit・route.source=estimate・legs は空・fareJpy なしで、start は終演後、end は start に上限の分を足した時刻にする。列車名・発着時刻・運賃は書かない",
    };
  }
  return { ...travelEstimateFor(ctx, homeStation, venueStation, at !== undefined ? toJstIso(at) : defaultArriveBy(ctx.event)), direction: "往路", howToUse: ESTIMATE_HOW_TO_USE };
}

/** 所要時間の目安。会場名からも都道府県を判定し、arrive_by が読めなければ既定の時刻を使う */
function travelEstimateFor(ctx: AgentContext, from: string, to: string, arriveBy: string): TravelEstimate {
  const at = Number.isFinite(Date.parse(arriveBy)) ? arriveBy : defaultArriveBy(ctx.event);
  return estimateTravel({ from: from || ctx.event.homeStation, to: to || ctx.event.venueStation, venue: ctx.event.venue, arriveBy: at });
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
export function repairTimeline(
  items: TimelineItem[],
  errors: string[],
  ctx: AgentContext,
): { items: TimelineItem[]; warnings: string[]; notes: string[]; removed: { title: string; keywords: string[] }[] } | undefined {
  const notes: string[] = [];
  const removed: { title: string; keywords: string[] }[] = [];
  // 「id: …」か、文頭・空白の直後の「id（…）」だけを一致とみなす（1 が spot-1 に一致しないように）
  const isNamed = (id: string) => {
    const labeled = new RegExp(`(^|\\s)${escapeRegExp(id)}（`);
    return errors.some((e) => e.startsWith(`${id}:`) || labeled.test(e));
  };
  let next = items.filter((it) => {
    if (!isNamed(it.id) || it.kind === "event" || it.kind === "transit") return true;
    notes.push(`「${it.title}」は時間が合わなかったため外しました。必要なら「AIに相談して直す」から追加してください`);
    const label = it.kind === "beauty" && it.category && it.category in BEAUTY_GUIDELINES ? BEAUTY_GUIDELINES[it.category as keyof typeof BEAUTY_GUIDELINES].label : undefined;
    removed.push({ title: it.title, keywords: [it.title, ...(label ? [label] : [])] });
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
  // 直したあとも、提出時と同じ検査（駅すぱあとの経路の出どころを含む）を通ったときだけ使う
  const check = checkSubmission(next, "", ctx);
  if (check.errors.length > 0) return undefined;
  return { items: next, warnings: check.warnings, notes, removed };
}

/** ルールベース用: イベント日から days 日前の JST 日付の hour 時 */
export const daysBefore = (eventIso: string, days: number, hour: number) => {
  const key = new Date(Date.parse(eventIso) - days * MS_DAY + 9 * 3600_000).toISOString().slice(0, 10);
  return jstAt(key, hour);
};

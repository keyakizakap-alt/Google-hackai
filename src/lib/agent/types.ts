import { z } from "zod";

/** クライアント・サーバー共通のドメイン型（zod で実行時検証も行う） */

export const BEAUTY_SERVICES = ["brow", "hair", "nail", "eyelash", "skincare"] as const;
export type BeautyService = (typeof BEAUTY_SERVICES)[number];

export const BEAUTY_LABEL: Record<BeautyService, string> = {
  brow: "眉毛サロン",
  hair: "ヘアカット",
  nail: "ネイル",
  eyelash: "まつげパーマ",
  skincare: "フェイシャル",
};

const isoDate = z
  .string()
  .max(40)
  .refine((s) => Number.isFinite(Date.parse(s)), "ISO 8601 形式の日時が必要です");

export const OshiEventSchema = z.object({
  id: z.string().max(40),
  artist: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  venue: z.string().min(1).max(60),
  venueStation: z.string().min(1).max(40),
  startAt: isoDate,
  homeStation: z.string().min(1).max(40),
  beautyServices: z.array(z.enum(BEAUTY_SERVICES)).max(5),
  /** 物販などのため早めに現地入りしたいか */
  arriveEarlyForGoods: z.boolean().default(true),
  budgetJpy: z.number().int().min(0).max(1_000_000).optional(),
  /** カレンダーから自動取り込み／手入力／スクショ・文章から読み取り */
  source: z.enum(["calendar", "manual", "scan"]).optional(),
  /** 終日予定などで開演時刻が不明（18:00 と仮置き） */
  timeUnknown: z.boolean().optional(),
});
export type OshiEvent = z.infer<typeof OshiEventSchema>;

export const RouteLegSchema = z.object({
  line: z.string().max(60),
  from: z.string().max(40),
  to: z.string().max(40),
  departure: z.string().max(40).optional(),
  arrival: z.string().max(40).optional(),
});

export const TimelineItemSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(["beauty", "transit", "prep", "stay", "event", "spot"]),
  category: z.string().max(20).optional(),
  title: z.string().min(1).max(60),
  start: isoDate,
  end: isoDate,
  location: z.string().max(60).optional(),
  provider: z
    .object({
      name: z.string().max(60),
      priceJpy: z.number().int().min(0).max(1_000_000).optional(),
      bookingUrl: z.string().max(300).optional(),
      slotId: z.string().max(60).optional(),
    })
    .optional(),
  route: z
    .object({
      from: z.string().max(40),
      to: z.string().max(40),
      summary: z.string().max(200),
      legs: z.array(RouteLegSchema).max(12).default([]),
      fareJpy: z.number().int().min(0).max(200_000).optional(),
      source: z.enum(["ekispert", "mock"]),
    })
    .optional(),
  rationale: z.string().max(300),
  requiresBooking: z.boolean(),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

/** エージェントの判断の記録（何と何を比べて、なぜそれを選んだか）。画面で根拠として見せる */
export const DecisionSchema = z.object({
  topic: z.string().max(40),
  chosen: z.string().max(80),
  alternatives: z.array(z.string().max(60)).max(3).default([]),
  reason: z.string().max(200),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const PlanSchema = z.object({
  id: z.string().max(40),
  event: OshiEventSchema,
  summary: z.string().max(400),
  items: z.array(TimelineItemSchema).min(1).max(20),
  warnings: z.array(z.string().max(200)).max(10),
  /** 省略可（以前に作ったプランの署名を壊さないため） */
  decisions: z.array(DecisionSchema).max(6).optional(),
  generatedBy: z.object({ engine: z.enum(["gemini", "rule-based"]), model: z.string().max(60) }),
  revision: z.number().int().min(0).max(50),
  createdAt: isoDate,
});
export type Plan = z.infer<typeof PlanSchema>;

/** Human-in-the-loop のステータス */
export const PLAN_STATUSES = [
  "draft",
  "generating",
  "pending_approval",
  "revising",
  "approved",
  "rejected",
  "booking",
  "booked",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type Actor = "agent" | "user" | "system";

export const HistoryEntrySchema = z.object({
  status: z.enum(PLAN_STATUSES),
  at: isoDate,
  actor: z.enum(["agent", "user", "system"]),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/** 署名付きプラン封筒。サーバーは DB を持たず、この署名でステータス改ざんを検知する */
export const PlanEnvelopeSchema = z.object({
  plan: PlanSchema,
  status: z.enum(PLAN_STATUSES),
  approvedItemIds: z.array(z.string().max(40)).max(20).default([]),
  history: z.array(HistoryEntrySchema).max(60),
  issuedAt: isoDate,
  expiresAt: isoDate,
  sig: z.string().max(200),
});
export type PlanEnvelope = z.infer<typeof PlanEnvelopeSchema>;

/** エージェントの思考過程を可視化するためのトレース（個人情報は含めない） */
export interface TraceStep {
  step: number;
  type: "tool" | "model" | "guardrail";
  name: string;
  ok: boolean;
  latencyMs: number;
  summary: string;
}

export interface SkinAnalysis {
  source: "youcam" | "mock";
  scores: { key: string; label: string; score: number }[];
  advice: string[];
}

/**
 * 承認後の予約結果。
 * - reserved: アプリ内で予約した（予約の部品が対応している項目。デモ予約なら demo: true）
 * - handoff: 対応する部品がないため、予約サイトへ案内した
 * 決済は行わない。
 */
export interface BookingResult {
  itemId: string;
  title: string;
  status: "reserved" | "handoff";
  externalUrl?: string;
  note: string;
  confirmationNo?: string;
  provider?: string;
  demo?: boolean;
  /** キャンセル用の控え（暗号化済み。アプリ内キャンセルのときだけ送り返す） */
  cancelTicket?: string;
}

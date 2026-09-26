import { NextResponse } from "next/server";
import { z } from "zod";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { advance, GuardrailError, hasUserApproval } from "@/lib/agent/stateMachine";
import type { BookingResult, TimelineItem } from "@/lib/agent/types";
import { assertSameOrigin, errorResponse, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown(), confirm: z.literal(true) });

const JALAN = (q: string) => `https://www.jalan.net/uw/uwp1700/uww1701.do?keyword=${encodeURIComponent(q)}`;

/**
 * 承認済み項目を「予約サイトへの案内」に変換する。
 * OshiReady 自身は予約・決済を行わない（架空の予約番号も発行しない）。
 * 実際の予約はユーザーが各予約サイトで行い、アプリ側では手続き状況を管理する。
 */
function handoff(item: TimelineItem): BookingResult {
  switch (item.kind) {
    case "beauty":
      return {
        itemId: item.id,
        title: item.provider?.name ? `${item.title}（${item.provider.name}）` : item.title,
        status: "handoff",
        externalUrl: item.provider?.bookingUrl,
        note: "予約サイトで空き状況を確認し、予約してください。",
      };
    case "transit":
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: "https://roote.ekispert.net/",
        note: "乗車券・特急券は鉄道会社の予約サイトや駅で購入してください。",
      };
    case "stay":
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: item.provider?.bookingUrl ?? JALAN(item.location ?? item.title),
        note: "宿泊予約サイトで予約してください。",
      };
    default:
      return { itemId: item.id, title: item.title, status: "handoff", externalUrl: item.provider?.bookingUrl, note: "予約サイトで手続きしてください。" };
  }
}

/**
 * 予約手続きの開始。以下をすべて満たす場合のみ実行する（Human-in-the-loop の最終ゲート）:
 *  1. 署名が正しく、期限内であること
 *  2. status === "approved" かつ履歴に「pending_approval → approved（ユーザー操作）」があること
 *  3. 専用ヘッダーと confirm: true が送られていること（UI の予約ボタン経由）
 *  4. 対象はユーザーが承認時にチェックした項目のみ
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "booking" };
  const denied = assertSameOrigin(req, "book");
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "ユーザーの確認が必要です" }, { status: 400 });
    const env = verifyEnvelope(parsed.data.envelope);
    if (env.status !== "approved" || !hasUserApproval(env.history)) {
      throw new GuardrailError("承認されていないプランは予約の手続きに進めません", "USER_ACTION_REQUIRED");
    }
    let history = advance(env.history, "approved", "booking", "user");
    const approved = new Set(env.approvedItemIds);
    const results = env.plan.items.filter((i) => i.requiresBooking && approved.has(i.id)).map(handoff);
    history = advance(history, "booking", "booked", "system");
    logger.info("plan.transition", { ...meta, planId: env.plan.id, fromStatus: "approved", toStatus: "booked", itemCount: results.length });
    return NextResponse.json({ envelope: signEnvelope({ plan: env.plan, status: "booked", approvedItemIds: env.approvedItemIds, history }), results });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

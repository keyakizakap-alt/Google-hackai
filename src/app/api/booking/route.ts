import { NextResponse } from "next/server";
import { z } from "zod";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { advance, GuardrailError, hasUserApproval } from "@/lib/agent/stateMachine";
import type { BookingResult, TimelineItem } from "@/lib/agent/types";
import { randomId } from "@/lib/crypto";
import { assertSameOrigin, errorResponse, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown(), confirm: z.literal(true) });

function book(item: TimelineItem): BookingResult {
  switch (item.kind) {
    case "beauty":
      // サロン予約 API のモック（実運用では予約サービスの API に置き換える）
      return {
        itemId: item.id,
        title: `${item.title}（${item.provider?.name ?? ""}）`,
        status: "reserved",
        confirmationCode: `OR-${randomId(4).toUpperCase()}`,
        externalUrl: item.provider?.bookingUrl,
        note: "デモ予約（モック）です。実際の予約は予約サイトで確定してください。",
      };
    case "transit":
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: "https://roote.ekispert.net/",
        note: "乗車券・特急券は外部サイトで購入してください（決済は OshiReady では行いません）。",
      };
    default:
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: item.provider?.bookingUrl,
        note: "外部サイトで予約を確定してください。",
      };
  }
}

/**
 * 予約実行。以下をすべて満たす場合のみ実行する（Human-in-the-loop の最終ゲート）:
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
      throw new GuardrailError("承認されていないプランは予約できません", "USER_ACTION_REQUIRED");
    }
    let history = advance(env.history, "approved", "booking", "user");
    const approved = new Set(env.approvedItemIds);
    const results = env.plan.items.filter((i) => i.requiresBooking && approved.has(i.id)).map(book);
    history = advance(history, "booking", "booked", "system");
    logger.info("plan.transition", { ...meta, planId: env.plan.id, fromStatus: "approved", toStatus: "booked", itemCount: results.length });
    return NextResponse.json({ envelope: signEnvelope({ plan: env.plan, status: "booked", approvedItemIds: env.approvedItemIds, history }), results });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

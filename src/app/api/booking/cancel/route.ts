import { NextResponse } from "next/server";
import { z } from "zod";
import { providerById, readCancelTicket } from "@/lib/booking";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ ticket: z.string().min(10).max(2000), confirm: z.literal(true) });

/**
 * アプリ内で予約した項目のキャンセル。以下をすべて満たす場合のみ実行する:
 *  1. 画面の「キャンセルする」の確認を経た専用ヘッダーと confirm: true があること
 *  2. 予約時に発行した控え（暗号化済み）が正しく、期限内であること（偽造・改ざんは読めない）
 * AI エージェントはこの操作を呼べない。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "booking.cancel" };
  const denied = assertSameOrigin(req, "cancel") ?? rateLimit(req, "booking-cancel", 10);
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return NextResponse.json({ error: "キャンセルにはあなたの確認が必要です" }, { status: 400 });
    const ticket = readCancelTicket(parsed.data.ticket);
    if (!ticket) return NextResponse.json({ error: "この予約はアプリからキャンセルできません。予約した窓口に連絡してください" }, { status: 400 });
    const provider = providerById(ticket.provider);
    if (!provider) return NextResponse.json({ error: "この予約の窓口は現在使えません。予約した窓口に連絡してください" }, { status: 409 });
    await provider.cancel(ticket.ref);
    logger.info("booking.cancelled", { ...meta, planId: ticket.planId, mode: provider.id });
    return NextResponse.json({ ok: true, status: "cancelled", demo: provider.demo });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

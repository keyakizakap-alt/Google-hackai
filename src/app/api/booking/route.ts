import { NextResponse } from "next/server";
import { z } from "zod";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { advance, GuardrailError, hasUserApproval } from "@/lib/agent/stateMachine";
import type { BookingResult, TimelineItem } from "@/lib/agent/types";
import { issueCancelTicket, providerFor } from "@/lib/booking";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { EKISPERT_ROUTE_URL, hotpepperSearchUrl, jalanSearchUrl, safeExternalUrl } from "@/lib/safeUrl";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown(), confirm: z.literal(true) });


/**
 * 予約の部品が対応していない項目を「予約サイトへの案内」に変換する。
 * 架空の予約番号は発行しない（アプリ内で予約した項目だけが予約番号を持つ）。
 */
function handoff(item: TimelineItem): BookingResult {
  switch (item.kind) {
    case "beauty":
      return {
        itemId: item.id,
        title: item.provider?.name ? `${item.title}（${item.provider.name}）` : item.title,
        status: "handoff",
        externalUrl: safeExternalUrl(item.provider?.bookingUrl) ?? hotpepperSearchUrl(`${item.location ?? ""} ${item.title}`),
        note: "予約サイトで空き状況を確認し、予約してください。",
      };
    case "transit":
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: EKISPERT_ROUTE_URL,
        note: "乗車券・特急券は鉄道会社の予約サイトや駅で購入してください。",
      };
    case "stay":
      return {
        itemId: item.id,
        title: item.title,
        status: "handoff",
        externalUrl: safeExternalUrl(item.provider?.bookingUrl) ?? jalanSearchUrl(item.location ?? item.title),
        note: "宿泊予約サイトで予約してください。",
      };
    default:
      return { itemId: item.id, title: item.title, status: "handoff", externalUrl: safeExternalUrl(item.provider?.bookingUrl), note: "予約サイトで手続きしてください。" };
  }
}

/**
 * 予約手続きの開始。以下をすべて満たす場合のみ実行する（Human-in-the-loop の最終ゲート）:
 *  1. 署名が正しく、期限内であること
 *  2. status === "approved" かつ履歴に「pending_approval → approved（ユーザー操作）」があること
 *  3. 専用ヘッダーと confirm: true が送られていること（UI の予約ボタン経由）
 *  4. 対象はユーザーが承認時にチェックした項目のみ
 * 予約の部品（src/lib/booking）が対応する項目はアプリ内で予約し、対応しない項目は予約サイトへ案内する。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "booking" };
  const denied = assertSameOrigin(req, "book") ?? rateLimit(req, "booking", 10);
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
    const targets = env.plan.items.filter((i) => i.requiresBooking && approved.has(i.id));
    const results: BookingResult[] = [];
    for (const item of targets) {
      const provider = providerFor(item);
      if (!provider) {
        results.push(handoff(item));
        continue;
      }
      const r = await provider.reserve(item);
      results.push({
        itemId: item.id,
        // 店舗が決まっていない仮の名前（予約サイトで店舗と空きを確認）は予約名に入れない
        title: item.provider?.name && !item.provider.name.includes("予約サイト") ? `${item.title}（${item.provider.name}）` : item.title.replace(/（[^）]*予約サイト[^）]*）/g, ""),
        status: "reserved",
        confirmationNo: r.confirmationNo,
        provider: provider.label,
        demo: provider.demo,
        note: provider.demo ? "デモ予約です。実在の店舗・交通機関・宿には連絡していません。" : `${provider.label}で予約しました。`,
        cancelTicket: issueCancelTicket({ provider: provider.id, ref: r.ref, itemId: item.id, planId: env.plan.id }),
      });
    }
    history = advance(history, "booking", "booked", "system");
    logger.info("plan.transition", { ...meta, planId: env.plan.id, fromStatus: "approved", toStatus: "booked", itemCount: results.length, mode: results.some((r) => r.status === "reserved") ? "reserved" : "handoff" });
    return NextResponse.json({ envelope: signEnvelope({ plan: env.plan, status: "booked", approvedItemIds: env.approvedItemIds, history }), results });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

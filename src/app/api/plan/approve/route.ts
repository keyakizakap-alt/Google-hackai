import { NextResponse } from "next/server";
import { z } from "zod";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { advance, GuardrailError } from "@/lib/agent/stateMachine";
import { assertSameOrigin, errorResponse, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown(), approvedItemIds: z.array(z.string().max(40)).max(20) });

/** ユーザーによる承認（pending_approval → approved）。UI の承認ボタンからのみ呼ばれる */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "plan.approve" };
  const denied = assertSameOrigin(req, "approve");
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const env = verifyEnvelope(parsed.data.envelope);
    const bookable = new Set(env.plan.items.filter((i) => i.requiresBooking).map((i) => i.id));
    const ids = [...new Set(parsed.data.approvedItemIds)];
    if (ids.some((id) => !bookable.has(id))) throw new GuardrailError("予約対象外の項目が含まれています", "INVALID_TRANSITION");

    const history = advance(env.history, env.status, "approved", "user");
    const next = signEnvelope({ plan: env.plan, status: "approved", approvedItemIds: ids, history });
    logger.info("plan.transition", { ...meta, planId: env.plan.id, fromStatus: env.status, toStatus: "approved", itemCount: ids.length });
    return NextResponse.json({ envelope: next });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { advance } from "@/lib/agent/stateMachine";
import { assertSameOrigin, errorResponse, requestMeta, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown() });

export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "plan.reject" };
  const denied = assertSameOrigin(req, "reject");
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const env = verifyEnvelope(parsed.data.envelope);
    const history = advance(env.history, env.status, "rejected", "user");
    logger.info("plan.transition", { ...meta, planId: env.plan.id, fromStatus: env.status, toStatus: "rejected" });
    return NextResponse.json({ envelope: signEnvelope({ plan: env.plan, status: "rejected", approvedItemIds: [], history }) });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEnvelope } from "@/lib/agent/envelope";
import { generatePlan } from "@/lib/agent/workflow";
import { assertSameOrigin, dailyAgentCap, errorResponse, rateLimit, requestMeta } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ envelope: z.unknown(), instruction: z.string().min(1).max(500) });

/** 修正指示チャット: 現在のプランを踏まえて再計画し、再び pending_approval に戻す（期限切れのプランは新しいプランとして作り直す） */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "agent.revise" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "agent", 6) ?? dailyAgentCap();
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "修正内容を入力してください" }, { status: 400 });
    // 期限切れのプランも、内容を参考にした作り直しには使える。ただし古い承認は引き継がず、新しい承認待ちとして作る
    const env = verifyEnvelope(parsed.data.envelope, Date.now(), { allowExpired: true });
    const expired = Date.parse(env.expiresAt) < Date.now();
    const out = await generatePlan({
      event: env.plan.event,
      ...(expired ? { basePlan: env.plan } : { previous: { plan: env.plan, status: env.status, history: env.history } }),
      instruction: parsed.data.instruction,
      ...meta,
    });
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e, meta);
  }
}

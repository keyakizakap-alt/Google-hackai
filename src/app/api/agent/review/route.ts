import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEnvelope } from "@/lib/agent/envelope";
import { reviewInstruction } from "@/lib/agent/watch";
import { watchPlan, WATCHED_STATUSES } from "@/lib/agent/watchRun";
import { generatePlan } from "@/lib/agent/workflow";
import { assertSameOrigin, dailyAgentCap, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

const Body = z.object({ envelope: z.unknown() });

/**
 * 見張りで変化が見つかったときに、エージェントに見直し案を作らせる。
 *
 * - 変化はサーバーで調べ直す（画面から送られた内容は信用しない）。変化が無ければ AI は呼ばない
 * - 指示文はサーバーで組み立てる（利用者の入力は混ざらない）
 * - 見直し案は新しいプランとして必ず承認待ちで止まる。今のプランや予約は変えない
 * - 履歴には「system が始めた」と残す
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "agent.review" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "agent", 6);
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "入力内容を確認してください" }, { status: 400 });
    const env = verifyEnvelope(parsed.data.envelope, Date.now(), { allowExpired: true });
    if (!WATCHED_STATUSES.has(env.status)) return NextResponse.json({ proposal: null, signals: [] });
    const watch = await watchPlan(env);
    if (watch.signals.length === 0) return NextResponse.json({ proposal: null, signals: [] });

    const capped = dailyAgentCap();
    if (capped) return capped;
    const keep = env.plan.items.filter((i) => env.approvedItemIds.includes(i.id)).map((i) => i.title).slice(0, 6);
    const out = await generatePlan({
      event: env.plan.event,
      basePlan: env.plan,
      instruction: reviewInstruction(watch.signals, keep),
      initiatedBy: "system",
      ...meta,
    });
    logger.info("agent.review", { ...meta, planId: env.plan.id, signalCount: watch.signals.length, revision: out.envelope.plan.revision });
    return NextResponse.json({ proposal: out, signals: watch.signals, key: watch.key });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

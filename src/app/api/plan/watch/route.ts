import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEnvelope } from "@/lib/agent/envelope";
import { watchPlan, WATCHED_STATUSES } from "@/lib/agent/watchRun";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

const Body = z.object({ envelope: z.unknown() });

/**
 * 見張り: 承認したプランが、その後のカレンダーの変化や天気で困ったことにならないかを調べる。
 * AI は呼ばない（費用がかからない）。返すのは「何が起きたか」だけで、カレンダーの予定の中身は返さない。
 * 封筒は署名を確かめたうえで、期限切れでも参照する（状態は進めない）。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "plan.watch" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "watch", 12);
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "入力内容を確認してください" }, { status: 400 });
    const env = verifyEnvelope(parsed.data.envelope, Date.now(), { allowExpired: true });
    if (!WATCHED_STATUSES.has(env.status)) return NextResponse.json({ signals: [], key: null, calendarChecked: false });
    const out = await watchPlan(env);
    logger.info("plan.watch", { ...meta, planId: env.plan.id, signalCount: out.signals.length, calendarChecked: out.calendarChecked });
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e, meta);
  }
}

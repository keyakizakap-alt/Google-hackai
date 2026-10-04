import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";
import { findConflicts } from "@/lib/agent/conflicts";
import { collectBusy } from "@/lib/sources";

const Body = z.object({
  items: z
    .array(z.object({ id: z.string().max(40), start: z.string().max(40), end: z.string().max(40) }))
    .max(20),
});

/**
 * プランの各項目が、カレンダーに後から入った予定と重なっていないかを調べる。
 * 返すのは「どの項目が重なったか」だけで、カレンダーの予定の中身は返さない（時間帯だけで判定）。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "plan.conflicts" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "conflicts", 12);
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "入力内容を確認してください" }, { status: 400 });
    const now = Date.now();
    const items = parsed.data.items.filter((i) => Date.parse(i.start) > now);
    if (items.length === 0) return NextResponse.json({ checked: false, conflicts: [] });
    const to = Math.max(...items.map((i) => Date.parse(i.end))) + 60_000;
    const { source, busy } = await collectBusy({ from: now, to });
    if (source !== "calendar") return NextResponse.json({ checked: false, conflicts: [] });
    const conflicts = findConflicts(items, busy);
    logger.info("plan.conflicts", { ...meta, itemCount: items.length, busyCount: busy.length, candidates: conflicts.length });
    return NextResponse.json({ checked: true, conflicts });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

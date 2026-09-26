import { NextResponse } from "next/server";
import { z } from "zod";
import { extractFreeSlots, summarizeByDay } from "@/lib/availability";
import { getBusyBlocks } from "@/lib/google/calendar";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";
import { jstDateKey } from "@/lib/time";

const Body = z.object({ until: z.string().max(40).optional() });

/**
 * 直近 1 ヶ月（またはイベント日まで）の空き時間を返す。
 * 返すのは時間帯と日別の分量のみで、予定の中身は一切含まない。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "calendar.availability" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "availability", 20);
  if (denied) return denied;
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    const until = body.until ? Date.parse(body.until) : undefined;
    const { source, busy, from, to } = await getBusyBlocks({
      days: 30,
      until: Number.isFinite(until) ? until : undefined,
      demoDayOff: until && Number.isFinite(until) ? jstDateKey(until) : undefined,
    });
    const free = extractFreeSlots(busy, { from, to });
    const days = summarizeByDay(busy, free, from, to);
    logger.info("availability.ok", { ...meta, mode: source, busyCount: busy.length, slotCount: free.length });
    return NextResponse.json({ source, from: new Date(from).toISOString(), to: new Date(to).toISOString(), busyCount: busy.length, freeSlots: free.slice(0, 60), days });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

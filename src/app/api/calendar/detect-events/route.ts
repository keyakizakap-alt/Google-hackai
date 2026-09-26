import { NextResponse } from "next/server";
import { pickLiveCandidates } from "@/lib/eventDetection/detect";
import { extractLiveEvents } from "@/lib/eventDetection/extract";
import { getItemsForDetection } from "@/lib/google/calendar";
import { assertSameOrigin, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

/**
 * カレンダーからライブ・公演を検出して返す。
 * 1) 予定を取得 → 2) キーワードで「ライブ候補」だけに絞る（それ以外は即破棄）
 * 3) 候補のみ Gemini / ルールで構造化。サーバーには何も保存せず、ログは件数のみ。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "calendar.detect" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "detect", 10);
  if (denied) return denied;
  try {
    const { source, items } = await getItemsForDetection(180);
    const total = items.length;
    const candidates = pickLiveCandidates(items);
    items.length = 0; // 候補以外の予定への参照を破棄
    const events = await extractLiveEvents(candidates, meta.requestId);
    logger.info("detect.ok", { ...meta, mode: source, scanned: total, candidates: candidates.length, itemCount: events.length });
    return NextResponse.json({ source, scanned: total, events });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

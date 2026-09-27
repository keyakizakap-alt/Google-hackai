import { NextResponse } from "next/server";
import { extractLiveEvents } from "@/lib/eventDetection/extract";
import { assertSameOrigin, dailyAgentCap, errorResponse, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";
import { collectLiveCandidates } from "@/lib/sources";

export const maxDuration = 60;

/**
 * 連携中のカレンダーからライブ・公演を検出して返す。
 * 1) 各連携先から予定を取得 → 2) 共通の安全チェック（gate）でライブ候補だけに絞る（それ以外は即破棄）
 * 3) 候補のみ Gemini / ルールで構造化。サーバーには何も保存せず、ログは件数のみ。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "calendar.detect" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "detect", 10) ?? dailyAgentCap();
  if (denied) return denied;
  try {
    const now = Date.now();
    const { sources, scanned, candidates } = await collectLiveCandidates({ from: now, to: now + 180 * 86_400_000 });
    const events = await extractLiveEvents(candidates, meta.requestId);
    const source = sources.length ? "calendar" : "demo";
    logger.info("detect.ok", { ...meta, mode: sources.join("+") || "none", scanned, candidates: candidates.length, itemCount: events.length });
    return NextResponse.json({ source, sources, scanned, events });
  } catch (e) {
    return errorResponse(e, meta);
  }
}

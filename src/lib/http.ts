import "server-only";
import { NextResponse } from "next/server";
import { config } from "./config";
import { randomId } from "./crypto";
import { GuardrailError } from "./agent/stateMachine";
import { CalendarAuthError } from "./google/calendar";
import { logger, traceFromRequest } from "./logger";

export function requestMeta(req: Request) {
  return { requestId: req.headers.get("x-request-id") ?? randomId(6), trace: traceFromRequest(req) };
}

/**
 * CSRF 対策: 状態を変える API は同一オリジンからの fetch のみ受け付ける。
 * 承認・予約系はさらに独自ヘッダー（x-oshiready-action）を必須にし、
 * ユーザーの UI 操作以外（リンク踏ませ・フォーム自動送信）では到達できないようにする。
 */
export function assertSameOrigin(req: Request, requiredAction?: string): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([new URL(config.appBaseUrl).host, host].filter(Boolean));
  if (!origin || !allowed.has(new URL(origin).host)) {
    return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
  }
  if (requiredAction && req.headers.get("x-oshiready-action") !== requiredAction) {
    return NextResponse.json({ error: "explicit user action required" }, { status: 403 });
  }
  return null;
}

/** インスタンス内の簡易レート制限（コスト暴走防止）。本番は Cloud Armor 併用を推奨 */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(req: Request, key: string, limit: number, windowMs = 60_000): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [kk, v] of buckets) if (v.reset < now) buckets.delete(kk);
    return null;
  }
  b.count++;
  if (b.count > limit) return NextResponse.json({ error: "リクエストが多すぎます。少し待ってから再度お試しください。" }, { status: 429 });
  return null;
}

export function errorResponse(e: unknown, meta: { requestId: string; trace?: string; route: string }) {
  if (e instanceof GuardrailError) {
    logger.warn("guardrail.blocked", { ...meta, errorCode: e.code });
    return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
  }
  if (e instanceof CalendarAuthError) {
    logger.warn("calendar.auth", meta);
    return NextResponse.json({ error: e.message, code: "CALENDAR_AUTH" }, { status: 401 });
  }
  logger.error("unhandled", { ...meta, errorCode: e instanceof Error ? e.name : "unknown" });
  return NextResponse.json({ error: "処理中にエラーが発生しました", requestId: meta.requestId }, { status: 500 });
}

import "server-only";
import { NextResponse } from "next/server";
import { appBaseUrl } from "./config";
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
  const base = appBaseUrl();
  const allowed = new Set([base ? new URL(base).host : null, host].filter(Boolean));
  if (!origin || !allowed.has(new URL(origin).host)) {
    return NextResponse.json({ error: "この操作は OshiReady の画面からのみ行えます" }, { status: 403 });
  }
  if (requiredAction && req.headers.get("x-oshiready-action") !== requiredAction) {
    return NextResponse.json({ error: "この操作にはあなたの確認が必要です" }, { status: 403 });
  }
  return null;
}

/**
 * 利用者の IP アドレスを、偽装されにくい方法で取り出す。
 * - Vercel: X-Forwarded-For を Vercel が上書きするため先頭が実 IP（https://vercel.com/docs/headers/request-headers）
 * - Cloud Run 等: ロードバランサーは既存ヘッダーの末尾に追記するため、先頭は利用者が偽装できる。
 *   末尾から TRUSTED_PROXY_HOPS 番目（既定 1。外部 LB 経由なら 2）を使う。
 */
export function clientIp(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (xff.length === 0) return "local";
  if (process.env.VERCEL) return req.headers.get("x-real-ip") ?? xff[0];
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  return xff[Math.max(0, xff.length - hops)];
}

/** インスタンス内の簡易レート制限（コスト暴走防止）。本番は Vercel WAF / Cloud Armor の制限と併用する */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(req: Request, key: string, limit: number, windowMs = 60_000): NextResponse | null {
  const ip = clientIp(req);
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

/**
 * AI 呼び出しの 1 日あたり上限（インスタンス単位の最終防衛線）。
 * 本番の主な制限は Vercel WAF / Cloud Armor で行い、これは設定漏れ時のコスト暴走を抑える保険。
 * AGENT_DAILY_LIMIT で変更可（既定 500 回／日）。
 */
let daily = { day: "", count: 0 };
export function dailyAgentCap(): NextResponse | null {
  const limit = Number(process.env.AGENT_DAILY_LIMIT ?? 500);
  const day = new Date().toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, count: 0 };
  daily.count++;
  if (daily.count > limit) {
    return NextResponse.json({ error: "本日の AI 利用回数の上限に達しました。明日もう一度お試しください。" }, { status: 429 });
  }
  return null;
}

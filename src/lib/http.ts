import "server-only";
import { NextResponse } from "next/server";
import { appBaseUrl, ConfigError } from "./config";
import { randomId } from "./crypto";
import { GuardrailError } from "./agent/stateMachine";
import { AgentUnavailableError } from "./agent/orchestrator";
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
  if (!origin || !allowed.has(originHost(origin))) {
    return NextResponse.json({ error: "この操作は OshiReady の画面からのみ行えます" }, { status: 403 });
  }
  if (requiredAction && req.headers.get("x-oshiready-action") !== requiredAction) {
    return NextResponse.json({ error: "この操作にはあなたの確認が必要です" }, { status: 403 });
  }
  return null;
}

/** Origin ヘッダーのホスト部分。「null」など URL として読めない値は、どこにも一致しないものとして扱う */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/** 送られてきた本文が大きすぎるときのエラー（413 で返す） */
export class BodyTooLargeError extends Error {
  constructor() {
    super("送られたデータが大きすぎます");
  }
}

/**
 * 本文を上限つきで読み、JSON として返す（巨大な本文でメモリや CPU を使い切られるのを防ぐ）。
 * Content-Length を先に確かめ、無い・偽っている場合も読みながら上限で打ち切る。
 * JSON として読めないときは undefined を返す（呼び出し側の zod 検証で 400 にする）。
 */
export async function readJson(req: Request, maxBytes = 512 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * リダイレクト先を組み立てるための基準 URL。
 * Cloud Run（standalone）では req.url が「https://0.0.0.0:8080」になり、そのまま使うと壊れたリダイレクトになる。
 * 公開 URL（APP_BASE_URL）があればそれを使い、無ければ Host ヘッダーから組み立てる。
 */
export function redirectBase(req: Request): string {
  const base = appBaseUrl();
  if (base) return base;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
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
  if (b.count > limit) return NextResponse.json({ error: "操作が続いたため、少しお休みしています。1 分ほど待ってからもう一度お試しください。" }, { status: 429 });
  return null;
}

export function errorResponse(e: unknown, meta: { requestId: string; trace?: string; route: string }) {
  if (e instanceof BodyTooLargeError) {
    logger.warn("request.too_large", meta);
    return NextResponse.json({ error: "送られたデータが大きすぎます。画像を小さくするか、内容を減らしてもう一度お試しください。" }, { status: 413 });
  }
  if (e instanceof AgentUnavailableError) {
    logger.warn("agent.unavailable", meta);
    return NextResponse.json({ error: e.message, code: "AGENT_UNAVAILABLE" }, { status: 503 });
  }
  if (e instanceof GuardrailError) {
    logger.warn("guardrail.blocked", { ...meta, errorCode: e.code });
    return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
  }
  if (e instanceof ConfigError) {
    // 秘密の値そのものは出さず、どの設定が足りないかだけを伝える
    logger.error("config.missing", { ...meta, errorCode: e.setting });
    return NextResponse.json(
      { error: "アプリの準備がまだ整っていないため、プランを作れませんでした。しばらくしてからもう一度お試しください。（管理者の方へ：初期設定が足りていません）", code: "CONFIG_MISSING", requestId: meta.requestId },
      { status: 503 },
    );
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

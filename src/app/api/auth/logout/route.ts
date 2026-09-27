import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/config";
import { createOAuthClient } from "@/lib/google/oauth";
import { assertSameOrigin, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";
import { clearTokens, readTokens } from "@/lib/session";

/**
 * Google 連携の解除。Cookie を消すだけでなく、Google 側の許可（トークン）も取り消す。
 * 取り消しに失敗しても Cookie は必ず削除する。
 */
export async function POST(req: Request) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;
  const meta = { ...requestMeta(req), route: "auth.logout" };
  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  const token = tokens?.refresh_token ?? tokens?.access_token;
  let revoked = false;
  if (token) {
    try {
      await createOAuthClient().revokeToken(token);
      revoked = true;
    } catch (e) {
      logger.warn("oauth.revoke.failed", { ...meta, errorCode: (e as Error).name });
    }
  }
  await clearTokens();
  logger.info("oauth.disconnected", { ...meta, status: revoked ? "revoked" : "cleared" });
  return NextResponse.json({ ok: true, revoked });
}

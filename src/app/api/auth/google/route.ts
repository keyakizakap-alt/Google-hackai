import { NextResponse } from "next/server";
import { appBaseUrl, isGoogleOAuthConfigured } from "@/lib/config";
import { randomId } from "@/lib/crypto";
import { buildAuthUrl } from "@/lib/google/oauth";
import { redirectBase } from "@/lib/http";
import { writeOAuthState } from "@/lib/session";

export async function GET(req: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=oauth_not_configured", redirectBase(req)));
  }
  // Cloud Run は同じサービスに複数の URL がある。Google から戻る先（APP_BASE_URL）と違う URL で開始すると
  // 本人確認用の Cookie が戻り先で読めず連携に失敗するため、先に公開 URL へ移ってから始める。
  const base = new URL(appBaseUrl()!);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && host !== base.host) {
    return NextResponse.redirect(new URL("/api/auth/google", base));
  }
  const state = randomId(16);
  const { url, codeVerifier } = await buildAuthUrl(state);
  await writeOAuthState({ state, verifier: codeVerifier });
  return NextResponse.redirect(url);
}

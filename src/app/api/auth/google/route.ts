import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/config";
import { randomId } from "@/lib/crypto";
import { buildAuthUrl } from "@/lib/google/oauth";
import { writeOAuthState } from "@/lib/session";

export async function GET(req: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=oauth_not_configured", req.url));
  }
  const state = randomId(16);
  const { url, codeVerifier } = await buildAuthUrl(state);
  await writeOAuthState({ state, verifier: codeVerifier });
  return NextResponse.redirect(url);
}

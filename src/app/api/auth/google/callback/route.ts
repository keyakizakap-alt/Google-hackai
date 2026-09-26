import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { createOAuthClient } from "@/lib/google/oauth";
import { logger } from "@/lib/logger";
import { consumeOAuthState, writeTokens } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = await consumeOAuthState();
  const home = new URL("/", config.appBaseUrl);

  if (!code || !state || !saved || saved.state !== state) {
    logger.warn("oauth.callback.rejected", { route: "oauth.callback" });
    home.searchParams.set("error", "oauth_state");
    return NextResponse.redirect(home);
  }
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken({ code, codeVerifier: saved.verifier });
    await writeTokens(tokens);
    logger.info("oauth.connected", { route: "oauth.callback" });
    home.searchParams.set("connected", "1");
  } catch (e) {
    logger.error("oauth.token.failed", { route: "oauth.callback", errorCode: (e as Error).name });
    home.searchParams.set("error", "oauth_token");
  }
  return NextResponse.redirect(home);
}

import "server-only";
import { cookies } from "next/headers";
import { config } from "./config";
import { seal, unseal } from "./crypto";

/**
 * OAuth トークンは DB に保存せず、AES-256-GCM で暗号化した httpOnly Cookie にのみ保持する。
 * （カレンダーの予定データそのものは Cookie にも保存しない）
 */
export const SESSION_COOKIE = "or_sess";
export const OAUTH_STATE_COOKIE = "or_oauth";

export interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
}

const cookieBase = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: "lax" as const,
  path: "/",
});

export async function readTokens(): Promise<GoogleTokens | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const json = unseal(raw, "session");
  if (!json) return null;
  try {
    return JSON.parse(json) as GoogleTokens;
  } catch {
    return null;
  }
}

export async function writeTokens(tokens: GoogleTokens) {
  const jar = await cookies();
  const minimal: GoogleTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  };
  jar.set(SESSION_COOKIE, seal(JSON.stringify(minimal), "session"), {
    ...cookieBase(),
    maxAge: 60 * 60 * 24, // 24h で自動失効
  });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function writeOAuthState(state: { state: string; verifier: string }) {
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, seal(JSON.stringify(state), "oauth"), { ...cookieBase(), maxAge: 600 });
}

export async function consumeOAuthState(): Promise<{ state: string; verifier: string } | null> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  if (!raw) return null;
  const json = unseal(raw, "oauth");
  return json ? (JSON.parse(json) as { state: string; verifier: string }) : null;
}

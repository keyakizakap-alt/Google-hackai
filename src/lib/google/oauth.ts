import "server-only";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { config } from "../config";

/** 最小権限: 予定の読み取りのみ（書き込み・削除権限は要求しない） */
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events.readonly"];

export const redirectUri = () => `${config.appBaseUrl}/api/auth/google/callback`;

export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    redirectUri: redirectUri(),
  });
}

export async function buildAuthUrl(state: string) {
  const client = createOAuthClient();
  // PKCE で認可コード横取り攻撃を防ぐ
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES,
    state,
    include_granted_scopes: false,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, codeVerifier };
}

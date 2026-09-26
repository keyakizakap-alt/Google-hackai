import { NextResponse } from "next/server";
import { isEkispertConfigured, isGeminiConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { readTokens } from "@/lib/session";

export const dynamic = "force-dynamic";

/** UI 表示用の接続状態。使える/使えないだけを返し、モデル名や構成などの内部情報は返さない */
export async function GET() {
  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  return NextResponse.json({
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    calendarConnected: Boolean(tokens?.access_token || tokens?.refresh_token),
    gemini: { configured: isGeminiConfigured() },
    ekispert: { mode: isEkispertConfigured() ? "mcp" : "mock" },
    youcam: { mode: "mock" },
  });
}

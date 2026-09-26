import { NextResponse } from "next/server";
import { config, isEkispertConfigured, isGeminiConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { readTokens } from "@/lib/session";

export const dynamic = "force-dynamic";

/** UI 表示用の接続状態（秘密情報は返さない） */
export async function GET() {
  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  return NextResponse.json({
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    calendarConnected: Boolean(tokens?.access_token || tokens?.refresh_token),
    gemini: { configured: isGeminiConfigured(), model: config.gemini.model, platform: config.gemini.useVertex ? "Gemini Enterprise Agent Platform" : "Gemini API" },
    ekispert: { mode: isEkispertConfigured() ? "mcp" : "mock" },
    youcam: { mode: config.youcam.apiKey ? "api" : "mock" },
  });
}

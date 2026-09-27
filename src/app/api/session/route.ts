import { NextResponse } from "next/server";
import { isEkispertConfigured, isGeminiConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { enabledProviders } from "@/lib/booking";
import { describeSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** UI 表示用の接続状態。使える/使えないだけを返し、モデル名や構成などの内部情報は返さない */
export async function GET() {
  const sources = await describeSources();
  return NextResponse.json({
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    calendarConnected: sources.some((s) => s.connected),
    /** 有効な連携先（部品）の一覧。連携先を増やすと自動で画面に並ぶ */
    sources,
    gemini: { configured: isGeminiConfigured() },
    ekispert: { mode: isEkispertConfigured() ? "mcp" : "mock" },
    youcam: { mode: "mock" },
    booking: { inApp: enabledProviders().length > 0, demo: enabledProviders().some((p) => p.demo) },
  });
}

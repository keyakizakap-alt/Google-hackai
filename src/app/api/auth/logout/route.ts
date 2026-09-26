import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { clearTokens } from "@/lib/session";

export async function POST(req: Request) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;
  await clearTokens();
  return NextResponse.json({ ok: true });
}

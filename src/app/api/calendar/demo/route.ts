import { NextResponse } from "next/server";
import { assertSameOrigin, rateLimit, requestMeta } from "@/lib/http";
import { logger } from "@/lib/logger";
import { writeDemoCalendarChoice } from "@/lib/session";
import { probeSampleCalendar, sampleSource } from "@/lib/sources/sample";

/**
 * 「デモのカレンダーで試す」。ログインや同意画面なしで、デモ専用カレンダーとの連携を体験できるようにする。
 * 実際に読めることを確かめてから有効にし、読めない場合は理由を返す。
 */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "calendar.demo" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "demo-calendar", 10);
  if (denied) return denied;
  if (!sampleSource.isAvailable()) {
    return NextResponse.json({ error: "デモのカレンダーはまだ準備されていません。" }, { status: 404 });
  }
  try {
    await probeSampleCalendar();
  } catch (e) {
    logger.warn("sample.probe.failed", { ...meta, errorCode: (e as Error).name });
    return NextResponse.json(
      { error: "デモのカレンダーを読み込めませんでした。カレンダーの共有設定を確認してください。" },
      { status: 503 },
    );
  }
  await writeDemoCalendarChoice(true);
  logger.info("sample.connected", meta);
  return NextResponse.json({ ok: true });
}

/** デモのカレンダーをやめる */
export async function DELETE(req: Request) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;
  await writeDemoCalendarChoice(false);
  return NextResponse.json({ ok: true });
}

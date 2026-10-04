import { NextResponse } from "next/server";
import { CalendarAuthError } from "@/lib/google/calendar";
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
    const auth = e instanceof CalendarAuthError;
    const httpStatus = auth ? e.httpStatus : undefined;
    logger.warn("sample.probe.failed", { ...meta, errorCode: (e as Error).name, httpStatus });
    const reason = auth ? (httpStatus ?? "token") : "other";
    return NextResponse.json({ error: probeMessage(reason), code: `DEMO_CALENDAR_${String(reason).toUpperCase()}` }, { status: 503 });
  }
  await writeDemoCalendarChoice(true);
  logger.info("sample.connected", meta);
  return NextResponse.json({ ok: true });
}

/** 読めなかった理由を、設定する人が次に何を確かめればよいか分かる言葉にする */
function probeMessage(reason: number | "token" | "other"): string {
  switch (reason) {
    case 404:
      return "デモのカレンダーが見つかりませんでした。管理者の方は、デモ用カレンダーの共有設定を確認してください。";
    case 403:
      return "デモのカレンダーを見る許可がありません。管理者の方は、共有の権限が「予定の詳細を表示」になっているか確認してください。";
    case 401:
      return "カレンダーにうまくつながりませんでした。少し待ってからもう一度お試しください。";
    case "token":
      return "デモのカレンダーを準備できませんでした。少し待ってからもう一度お試しください。";
    default:
      return "デモのカレンダーを読み込めませんでした。少し待ってからもう一度お試しください。";
  }
}

/** デモのカレンダーをやめる */
export async function DELETE(req: Request) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;
  await writeDemoCalendarChoice(false);
  return NextResponse.json({ ok: true });
}

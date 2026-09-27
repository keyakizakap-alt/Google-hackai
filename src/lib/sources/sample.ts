import "server-only";
import { config } from "../config";
import type { CalendarItemForDetection } from "../eventDetection/detect";
import { CalendarAuthError, DETECT_FIELDS, FIELDS, listEventPages } from "../google/calendar";
import { serviceAccountToken } from "../google/serviceAccount";
import { logger } from "../logger";
import { maskEvents, type RawCalendarEvent } from "../privacy/mask";
import { readDemoCalendarChoice, writeDemoCalendarChoice } from "../session";
import { MS_DAY } from "../time";
import type { CalendarSourceAdapter } from "./types";

async function token(): Promise<string> {
  try {
    return await serviceAccountToken();
  } catch (e) {
    logger.warn("sample.token.failed", { errorCode: (e as Error).name });
    throw new CalendarAuthError("デモのカレンダーを読み込めませんでした。");
  }
}

/**
 * デモ用カレンダーの部品。ログイン・同意画面なしで、審査員などが連携の流れを体験できる。
 * アプリのサービスアカウントに共有されたデモ専用カレンダー（DEMO_CALENDAR_ID）だけを読む。
 */
export const sampleSource: CalendarSourceAdapter = {
  id: "sample",
  label: "デモのカレンダー",
  connectPath: null,
  isAvailable: () => Boolean(config.demoCalendarId),
  async isConnected() {
    return Boolean(config.demoCalendarId) && (await readDemoCalendarChoice());
  },
  async fetchBusy({ from, to }) {
    let raw = await listEventPages<RawCalendarEvent>({
      accessToken: await token(),
      calendarId: config.demoCalendarId,
      from,
      to,
      fields: FIELDS,
      maxPages: 5,
      logEvent: "sample.events.list",
    });
    const busy = maskEvents(raw);
    raw = [];
    return busy;
  },
  async fetchItemsForDetection({ from, to }) {
    return listEventPages<CalendarItemForDetection>({
      accessToken: await token(),
      calendarId: config.demoCalendarId,
      from,
      to: Math.max(to, from + MS_DAY),
      fields: DETECT_FIELDS,
      maxPages: 4,
      logEvent: "sample.detect.list",
    });
  },
  async disconnect() {
    await writeDemoCalendarChoice(false);
  },
};

/** 共有設定が済んでいて実際に読めるかを、予定 1 日分の時間帯だけで確かめる */
export async function probeSampleCalendar(): Promise<void> {
  const now = Date.now();
  await listEventPages<RawCalendarEvent>({
    accessToken: await token(),
    calendarId: config.demoCalendarId,
    from: now,
    to: now + MS_DAY,
    fields: "items(start),nextPageToken",
    maxPages: 1,
    logEvent: "sample.probe",
  });
}

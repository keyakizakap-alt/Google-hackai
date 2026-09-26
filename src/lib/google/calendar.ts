import "server-only";
import { isGoogleOAuthConfigured } from "../config";
import { logger } from "../logger";
import { maskEvents, type BusyBlock, type RawCalendarEvent } from "../privacy/mask";
import { readTokens, writeTokens } from "../session";
import { MS_DAY } from "../time";
import { demoBusyBlocks } from "../demo/calendar";
import { createOAuthClient } from "./oauth";

const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * partial response で「時間帯と種別」だけを取得する（タイトル・説明・参加者はそもそも受信しない）。
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/list
 */
const FIELDS = "items(start,end,status,transparency,eventType),nextPageToken";

export type CalendarSource = "google" | "demo";

export interface BusyResult {
  source: CalendarSource;
  busy: BusyBlock[];
  from: number;
  to: number;
}

export class CalendarAuthError extends Error {}

/**
 * 直近の予定を取得し、即座に BusyBlock へマスキングして返す。
 * 生データはこの関数のローカル変数にしか存在せず、ログにも永続化層にも渡らない。
 */
export async function getBusyBlocks(opts: { days?: number; until?: number; demoDayOff?: string } = {}): Promise<BusyResult> {
  const from = Date.now();
  const to = Math.max(from + (opts.days ?? 30) * MS_DAY, opts.until ?? 0);

  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return { source: "demo", busy: demoBusyBlocks(from, to, opts.demoDayOff), from, to };
  }

  const client = createOAuthClient();
  client.setCredentials(tokens);
  let accessToken: string | null | undefined;
  try {
    accessToken = (await client.getAccessToken()).token;
  } catch {
    throw new CalendarAuthError("Google 認証の有効期限が切れました。再連携してください。");
  }
  if (!accessToken) throw new CalendarAuthError("Google 認証が必要です。");
  if (client.credentials.access_token !== tokens.access_token) {
    await writeTokens(client.credentials); // リフレッシュ後のトークンを Cookie に書き戻す
  }

  let raw: RawCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields: FIELDS,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const started = Date.now();
    const res = await fetch(`${EVENTS_ENDPOINT}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    logger.info("calendar.events.list", { httpStatus: res.status, latencyMs: Date.now() - started });
    if (res.status === 401 || res.status === 403) throw new CalendarAuthError("カレンダーへのアクセスが拒否されました。");
    if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
    const body = (await res.json()) as { items?: RawCalendarEvent[]; nextPageToken?: string };
    raw = raw.concat(body.items ?? []);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  const busy = maskEvents(raw);
  raw = []; // 参照を即座に破棄
  logger.info("calendar.masked", { busyCount: busy.length, mode: "google" });
  return { source: "google", busy, from, to };
}

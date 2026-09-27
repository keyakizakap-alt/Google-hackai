import "server-only";
import { isGoogleOAuthConfigured } from "../config";
import { logger } from "../logger";
import { maskEvents, type BusyBlock, type RawCalendarEvent } from "../privacy/mask";
import { readTokens, writeTokens } from "../session";
import { MS_DAY } from "../time";
import type { CalendarItemForDetection } from "../eventDetection/detect";
import { createOAuthClient } from "./oauth";

const eventsEndpoint = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

/**
 * partial response で「時間帯と種別」だけを取得する（タイトル・説明・参加者はそもそも受信しない）。
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/list
 */
export const FIELDS = "items(start,end,status,transparency,eventType),nextPageToken";

export type CalendarSource = "google" | "demo";

export interface BusyResult {
  source: CalendarSource;
  busy: BusyBlock[];
  from: number;
  to: number;
}

export class CalendarAuthError extends Error {}

/**
 * 予定一覧（events.list）をページ送りしながら取得する共通処理。
 * 取得項目は fields で必要最小限に絞る。結果はメモリ上でだけ扱い、呼び出し側ですぐにマスク／破棄する。
 */
export async function listEventPages<T>(opts: {
  accessToken: string;
  calendarId?: string;
  from: number;
  to: number;
  fields: string;
  maxPages: number;
  logEvent: string;
}): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < opts.maxPages; page++) {
    const params = new URLSearchParams({
      timeMin: new Date(opts.from).toISOString(),
      timeMax: new Date(opts.to).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields: opts.fields,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const started = Date.now();
    const res = await fetch(`${eventsEndpoint(opts.calendarId ?? "primary")}?${params}`, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      cache: "no-store",
    });
    logger.info(opts.logEvent, { httpStatus: res.status, latencyMs: Date.now() - started });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new CalendarAuthError("カレンダーへのアクセスが拒否されました。");
    }
    if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
    const body = (await res.json()) as { items?: T[]; nextPageToken?: string };
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  if (pageToken) throw new Error("Calendar results exceeded the supported page limit");
  return items;
}

/**
 * 直近の予定を取得し、即座に BusyBlock へマスキングして返す。
 * 生データはこの関数のローカル変数にしか存在せず、ログにも永続化層にも渡らない。
 */
export async function getBusyBlocks(opts: { days?: number; until?: number; demoDayOff?: string } = {}): Promise<BusyResult> {
  const from = Date.now();
  const to = Math.max(from + (opts.days ?? 30) * MS_DAY, opts.until ?? 0);

  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return { source: "demo", busy: [], from, to };
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

  let raw = await listEventPages<RawCalendarEvent>({ accessToken, from, to, fields: FIELDS, maxPages: 5, logEvent: "calendar.events.list" });

  const busy = maskEvents(raw);
  raw = []; // 参照を即座に破棄
  logger.info("calendar.masked", { busyCount: busy.length, mode: "google" });
  return { source: "google", busy, from, to };
}

/** ライブ検出用: タイトル・場所・日時だけを取得（参加者・説明文は受信しない） */
export const DETECT_FIELDS = "items(id,summary,location,start,end,status),nextPageToken";

/**
 * ライブ検出のために直近の予定（タイトル・場所・日時）を取得する。
 * 呼び出し側で即座に「ライブ候補」だけに絞り、残りは破棄すること。保存・ログ出力はしない。
 */
export async function getItemsForDetection(days = 180): Promise<{ source: CalendarSource; items: CalendarItemForDetection[] }> {
  const from = Date.now();
  const to = from + days * MS_DAY;
  const tokens = isGoogleOAuthConfigured() ? await readTokens() : null;
  if (!tokens?.access_token && !tokens?.refresh_token) return { source: "demo", items: [] };

  const client = createOAuthClient();
  client.setCredentials(tokens);
  let accessToken: string | null | undefined;
  try {
    accessToken = (await client.getAccessToken()).token;
  } catch {
    throw new CalendarAuthError("Google 認証の有効期限が切れました。再連携してください。");
  }
  if (!accessToken) throw new CalendarAuthError("Google 認証が必要です。");
  if (client.credentials.access_token !== tokens.access_token) await writeTokens(client.credentials);

  const items = await listEventPages<CalendarItemForDetection>({ accessToken, from, to, fields: DETECT_FIELDS, maxPages: 4, logEvent: "calendar.detect.list" });
  return { source: "google", items };
}

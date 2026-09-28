import type { OshiEvent, TimelineItem } from "./agent/types";

/**
 * リマインドの組み立て（画面・通知・カレンダーファイル共通。サーバーには送らない）。
 * 予定の中身はこの端末の中だけで使う。
 */
export interface Reminder {
  id: string;
  /** 知らせる時刻（ISO） */
  at: string;
  title: string;
  body: string;
  /** 対象の予定の開始時刻（ISO） */
  target: string;
  kind: "prep" | "todo" | "live";
}

export interface ReminderReservation {
  id: string;
  title: string;
  start: string;
  status: "todo" | "reserved" | "cancelled";
  confirmationNo?: string;
  /** prep（経路の確認など）は「予約」ではなく「確認」として知らせる */
  kind?: string;
}

const H = 3_600_000;

function jstDayAt(iso: string, dayOffset: number, hour: number): string {
  // その日（日本時間）の hour 時。dayOffset 日ずらす
  const d = new Date(Date.parse(iso) + 9 * H);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate() + dayOffset;
  return new Date(Date.UTC(y, m, day, hour - 9, 0, 0)).toISOString();
}

/**
 * 公演・承認済みプラン・予約から、リマインドを作る。
 * - 公演：前日 20 時に持ち物の確認、当日は出発の 1 時間前（出発がなければ開演 3 時間前）
 * - 予約済み：前日 20 時と 2 時間前
 * - 予約がまだ：3 日前の 12 時に「まだ予約していません」
 * - 準備（セルフケア等）：開始の 1 時間前
 */
export function buildReminders(params: {
  event: OshiEvent | null;
  planItems?: TimelineItem[];
  reservations?: ReminderReservation[];
}): Reminder[] {
  const out: Reminder[] = [];
  const { event } = params;
  if (event) {
    const departure = params.planItems?.find((i) => i.kind === "transit")?.start;
    out.push({
      id: `live-eve:${event.id}`,
      at: jstDayAt(event.startAt, -1, 20),
      title: `明日は ${event.artist}`,
      body: `${event.title}（${event.venue}）。チケット・モバイルバッテリー・推しグッズを確認しよう`,
      target: event.startAt,
      kind: "live",
    });
    out.push({
      id: `live-go:${event.id}`,
      at: new Date(Date.parse(departure ?? event.startAt) - (departure ? 1 : 3) * H).toISOString(),
      title: departure ? "そろそろ出発の準備" : "今日はライブ当日",
      body: departure ? `${event.title} に向けて 1 時間後に出発です` : `${event.title} は ${event.venue} で開演します`,
      target: departure ?? event.startAt,
      kind: "live",
    });
  }
  for (const r of params.reservations ?? []) {
    if (r.status === "cancelled") continue;
    if (r.status === "reserved") {
      const no = r.confirmationNo ? `（予約番号 ${r.confirmationNo}）` : "";
      out.push({ id: `res-eve:${r.id}`, at: jstDayAt(r.start, -1, 20), title: `明日：${r.title}`, body: `予約済み${no}`, target: r.start, kind: "prep" });
      out.push({ id: `res-2h:${r.id}`, at: new Date(Date.parse(r.start) - 2 * H).toISOString(), title: `2 時間後：${r.title}`, body: `予約済み${no}`, target: r.start, kind: "prep" });
    } else {
      const check = r.kind === "prep";
      out.push({
        id: `todo:${r.id}`,
        at: jstDayAt(r.start, -3, 12),
        title: `${check ? "まだ確認していません" : "まだ予約していません"}：${r.title}`,
        body: check ? "予約の管理から案内サイトを開けます" : "予約の管理から手続きできます",
        target: r.start,
        kind: "todo",
      });
    }
  }
  for (const i of params.planItems ?? []) {
    if (i.kind !== "prep") continue;
    out.push({ id: `prep:${i.id}`, at: new Date(Date.parse(i.start) - H).toISOString(), title: `1 時間後：${i.title}`, body: i.rationale.slice(0, 80), target: i.start, kind: "prep" });
  }
  return out.filter((r) => Number.isFinite(Date.parse(r.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** これから知らせるリマインド（過ぎたもの・予定が終わったものは除く） */
export function upcomingReminders(list: Reminder[], now: number, horizonDays = 60): Reminder[] {
  return list.filter((r) => Date.parse(r.target) > now && Date.parse(r.at) > now - 5 * 60_000 && Date.parse(r.at) < now + horizonDays * 86_400_000);
}

/** 通知すべき時刻を過ぎたもの（直近 15 分以内。アプリを開いたときに古い通知を大量に出さない） */
export function dueReminders(list: Reminder[], now: number, fired: ReadonlySet<string>): Reminder[] {
  return list.filter((r) => !fired.has(r.id) && Date.parse(r.at) <= now && Date.parse(r.at) > now - 15 * 60_000);
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** 1 行 75 オクテットで折り返す（RFC 5545） */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export interface CalendarEntry {
  uid: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  /** 何分前に知らせるか */
  alarmsMinutes: number[];
}

/**
 * アラーム付きのカレンダーファイル（.ics）を作る。スマホ・PC のカレンダーに追加すると、
 * アプリを閉じていても端末が通知する（サーバーに予定を保存しない）。
 */
export function buildIcs(entries: CalendarEntry[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OshiReady//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@oshiready`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    for (const m of e.alarmsMinutes) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(m))}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** 公演と準備プランを、アラーム付きのカレンダー項目にする */
export function planToCalendar(event: OshiEvent, items: TimelineItem[], confirmations: Record<string, string | undefined> = {}): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const hasEvent = items.some((i) => i.kind === "event");
  if (!hasEvent) {
    out.push({
      uid: `live-${event.id}`,
      title: `${event.artist}｜${event.title}`,
      start: event.startAt,
      end: new Date(Date.parse(event.startAt) + 3 * H).toISOString(),
      location: event.venue,
      alarmsMinutes: [24 * 60, 180],
    });
  }
  for (const i of items) {
    const no = confirmations[i.id];
    out.push({
      uid: `${event.id}-${i.id}`,
      title: i.kind === "event" ? `${event.artist}｜${i.title}` : i.title,
      start: i.start,
      end: i.end,
      location: i.location ?? i.route?.to,
      description: [no ? `予約番号: ${no}` : "", i.rationale].filter(Boolean).join("\n"),
      alarmsMinutes: i.kind === "event" ? [24 * 60, 180] : i.requiresBooking ? [24 * 60, 120] : [60],
    });
  }
  return out;
}

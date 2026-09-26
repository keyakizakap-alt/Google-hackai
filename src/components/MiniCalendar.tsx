"use client";

import type { Availability } from "./store";

const WEEK = ["月", "火", "水", "木", "金", "土", "日"];

/** 週単位のミニカレンダー。予定の中身は持たず、日別の空き/埋まり量だけで色付けする */
export function MiniCalendar({ availability, eventDate }: { availability: Availability | null; eventDate: string }) {
  const eventKey = eventDate.slice(0, 10);
  const monthLabel = `${Number(eventKey.slice(5, 7))}月`;
  // イベント日を含む週と、その前 1 週
  const ev = new Date(`${eventKey}T12:00:00+09:00`);
  const dow = (ev.getUTCDay() + 6) % 7; // 月曜始まり
  const monday = new Date(ev.getTime() - dow * 86_400_000);
  const days = Array.from({ length: 14 }, (_, i) => new Date(monday.getTime() + (i - 7) * 86_400_000));
  const byDate = new Map(availability?.days.map((d) => [d.date, d]) ?? []);

  return (
    <div className="rounded-2xl border border-line bg-white p-3 text-[11px]">
      <p className="mb-2 text-xs font-semibold text-ink">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-mute">
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
        {days.map((d) => {
          const key = new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
          const info = byDate.get(key);
          const isEvent = key === eventKey;
          const ratio = info ? info.freeMinutes / 720 : 0;
          const tone = !info ? "bg-lav-50" : ratio > 0.6 ? "bg-lav-200" : ratio > 0.2 ? "bg-lav-100" : "bg-rose-50";
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className={`grid h-5 w-5 place-items-center rounded-full ${isEvent ? "bg-rose-300 font-bold text-white" : "text-ink-soft"}`}>
                {Number(key.slice(8, 10))}
              </span>
              <span className={`h-3 w-full rounded ${isEvent ? "bg-rose-100" : tone}`} title={info ? `空き ${Math.round(info.freeMinutes / 60)}時間` : "未取得"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

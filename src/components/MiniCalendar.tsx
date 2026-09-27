"use client";

import type { CSSProperties } from "react";
import type { Availability } from "./store";

const WEEK = ["月", "火", "水", "木", "金", "土", "日"];

/**
 * 空き時間ヒートマップ。予定の中身は持たず、日別の空き時間量だけで濃淡を付ける。
 * 抽出のたびにセルが順番に点灯する。
 */
export function MiniCalendar({ availability, eventDate, scanning }: { availability: Availability | null; eventDate: string; scanning?: boolean }) {
  const eventKey = eventDate.slice(0, 10);
  const ev = new Date(`${eventKey}T12:00:00+09:00`);
  const dow = (ev.getUTCDay() + 6) % 7; // 月曜始まり
  const monday = new Date(ev.getTime() - dow * 86_400_000);
  const days = Array.from({ length: 21 }, (_, i) => new Date(monday.getTime() + (i - 14) * 86_400_000));
  const byDate = new Map(availability?.days.map((d) => [d.date, d]) ?? []);
  const month = Number(eventKey.slice(5, 7));

  return (
    <div className={`relative rounded-2xl bg-cloud p-3 ${scanning ? "scanning" : ""}`}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <p className="font-display text-2xl font-semibold leading-none text-ink">
          {month}
          <span className="ml-1 text-sm italic text-mute">月</span>
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-mute">
          空き
          <span className="flex gap-0.5">
            {[0.15, 0.4, 0.7, 1].map((o) => (
              <span key={o} className="h-2 w-2 rounded-sm" style={{ background: `rgb(var(--oshi-glow) / ${o})` }} />
            ))}
          </span>
          多
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-mute">
        {WEEK.map((w) => (
          <span key={w} className="pb-0.5">
            {w}
          </span>
        ))}
        {days.map((d, i) => {
          const key = new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
          const info = byDate.get(key);
          const isEvent = key === eventKey;
          const ratio = info ? Math.min(1, info.freeMinutes / 600) : 0;
          const style: CSSProperties = isEvent
            ? { background: "var(--color-night)", color: "#fff", boxShadow: "0 0 14px 2px rgb(var(--oshi-glow) / 0.7)" }
            : info
              ? { background: `rgb(var(--oshi-glow) / ${0.12 + ratio * 0.78})`, color: ratio > 0.6 ? "#fff" : undefined }
              : {};
          return (
            <span
              key={`${key}-${availability ? "on" : "off"}`}
              className={`pop-in grid aspect-square place-items-center rounded-lg text-[11px] font-semibold ${info || isEvent ? "" : "bg-white text-ink-soft"}`}
              style={{ ...style, "--delay": availability ? `${i * 35}ms` : "0ms" } as CSSProperties}
              title={isEvent ? "イベント当日" : info ? `空き ${Math.round(info.freeMinutes / 60)}時間` : "未取得"}
            >
              {isEvent ? "♡" : Number(key.slice(8, 10))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

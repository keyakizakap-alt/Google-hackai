"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarPlus } from "lucide-react";
import { buildIcs, buildReminders, dueReminders, planToCalendar, upcomingReminders, type Reminder } from "@/lib/reminders";
import { formatJst } from "@/lib/time";
import { useNow } from "./motion";
import { useStore } from "./store";

const PREF = "oshiready.remind";
const FIRED = "oshiready.remind.fired";

function readFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED, JSON.stringify([...s].slice(-300)));
  } catch {
    /* 保存できない環境では毎回判定 */
  }
}

/** 登録済みの公演・承認済みプラン・予約から、リマインドを組み立てる（端末の中だけ） */
export function useReminders(): Reminder[] {
  const { events, envelope, reservations } = useStore();
  return useMemo(() => {
    const planned = envelope && ["approved", "booked"].includes(envelope.status) ? envelope.plan : null;
    const list: Reminder[] = [];
    for (const e of events) {
      list.push(...buildReminders({ event: e, planItems: planned?.event.id === e.id ? planned.items : undefined }));
    }
    list.push(...buildReminders({ event: null, reservations }));
    // 同じ内容の重複を除く（id が同じものは 1 件に）
    const unique = list.filter((r, i) => list.findIndex((x) => x.id === r.id) === i);
    return unique.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [events, envelope, reservations]);
}

function notificationState(): "on" | "off" | "denied" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  let pref: string | null = null;
  try {
    pref = localStorage.getItem(PREF);
  } catch {
    /* 既定はオフ */
  }
  return Notification.permission === "granted" && pref === "on" ? "on" : "off";
}

/**
 * アプリを開いている間、リマインドの時刻になったら知らせる。
 * 通知を許可していればブラウザの通知、そうでなければ画面内のお知らせで出す。
 */
export function ReminderAgent() {
  const reminders = useReminders();
  const { notify } = useStore();
  const now = useNow(30_000);
  const fired = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (now === null) return;
    fired.current ??= readFired();
    const due = dueReminders(reminders, now, fired.current);
    if (due.length === 0) return;
    const useSystem = notificationState() === "on";
    for (const r of due) {
      fired.current.add(r.id);
      if (useSystem) {
        try {
          new Notification(r.title, { body: r.body, tag: r.id, icon: "/favicon.ico" });
        } catch {
          notify(`${r.title} — ${r.body}`);
        }
      } else notify(`${r.title} — ${r.body}`);
    }
    writeFired(fired.current);
  }, [now, reminders, notify]);

  return null;
}

/** 公演と承認済みプランを、アラーム付きでスマホ・PC のカレンダーに追加する（.ics をダウンロード） */
export function AddToCalendarButton({ className = "", label = "カレンダーに追加（リマインド付き）" }: { className?: string; label?: string }) {
  const { event, envelope, reservations, notify } = useStore();
  if (!event) return null;
  const onClick = () => {
    const plan = envelope && envelope.plan.event.id === event.id && ["approved", "booked"].includes(envelope.status) ? envelope.plan : null;
    const confirmations: Record<string, string | undefined> = {};
    for (const r of reservations) {
      if (r.eventId === event.id && r.status === "reserved") confirmations[r.id.split(":").pop()!] = r.confirmationNo;
    }
    const cancelled = new Set(reservations.filter((r) => r.eventId === event.id && r.status === "cancelled").map((r) => r.id.split(":").pop()!));
    const items = plan ? plan.items.filter((i) => !cancelled.has(i.id)) : [];
    const ics = buildIcs(planToCalendar(event, items, confirmations));
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `oshiready-${event.startAt.slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(plan ? "予定とリマインドをカレンダー用ファイルにしました。開くとカレンダーに追加できます" : "公演をカレンダー用ファイルにしました（プランを承認すると準備の予定も入ります）");
  };
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-2 ${className}`}>
      <CalendarPlus className="h-4 w-4" />
      {label}
    </button>
  );
}

/** ホームの「リマインド」カード */
export function RemindersCard() {
  const reminders = useReminders();
  const now = useNow(60_000);
  const [state, setState] = useState<ReturnType<typeof notificationState>>("off");
  useEffect(() => {
    const t = setTimeout(() => setState(notificationState()), 0);
    return () => clearTimeout(t);
  }, []);
  const list = now === null ? [] : upcomingReminders(reminders, now).slice(0, 5);

  const toggle = async () => {
    if (state === "on") {
      try {
        localStorage.setItem(PREF, "off");
      } catch {
        /* noop */
      }
      setState("off");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === "granted") {
      try {
        localStorage.setItem(PREF, "on");
      } catch {
        /* noop */
      }
    }
    setState(notificationState());
  };

  return (
    <section className="card p-6" aria-labelledby="reminders">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-mute">Reminders</p>
          <h2 id="reminders" className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <BellRing className="h-5 w-5 text-lav-600" /> リマインド
          </h2>
        </div>
        {state !== "unsupported" && (
          <button
            type="button"
            role="switch"
            aria-checked={state === "on"}
            disabled={state === "denied"}
            onClick={() => void toggle()}
            className={`min-h-[40px] rounded-full px-4 text-xs font-bold transition ${state === "on" ? "bg-night text-white" : "border border-line text-ink hover:bg-lav-50"} disabled:opacity-50`}
          >
            {state === "on" ? "通知オン" : state === "denied" ? "通知がブロックされています" : "通知をオンにする"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mute">
        公演の前日・予約の前日と 2 時間前・まだ予約していないものをお知らせします。アプリを閉じていても知らせてほしいときは「カレンダーに追加」を使ってください（スマホのカレンダーが通知します）。
      </p>
      {list.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-cloud px-4 py-6 text-center text-xs text-mute">これからのリマインドはありません</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {list.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.kind === "todo" ? "bg-rose-400" : r.kind === "live" ? "bg-lav-600" : "bg-lav-300"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{r.title}</p>
                <p className="truncate text-xs text-mute">{r.body}</p>
              </div>
              <span className="shrink-0 text-[11px] text-ink-soft">{formatJst(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <AddToCalendarButton className="mt-4 min-h-[44px] w-full rounded-xl border border-line text-sm font-bold text-ink hover:bg-lav-50" />
    </section>
  );
}

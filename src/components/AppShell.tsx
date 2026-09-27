"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ClipboardList, House, MapPin, Settings, X } from "lucide-react";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { formatJst } from "@/lib/time";
import { Logo } from "./brand";
import { CalendarConnectNotice } from "./CalendarConnect";
import { useNow } from "./motion";
import { OSHI_COLORS, useStore } from "./store";

const NAV = [
  { href: "/", label: "ホーム", en: "Home", icon: House },
  { href: "/events", label: "イベント", en: "Event", icon: CalendarDays },
  { href: "/plan", label: "プラン", en: "Plan", icon: ClipboardList },
  { href: "/bookings", label: "予約", en: "Booking", icon: MapPin },
  { href: "/settings", label: "設定", en: "Settings", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

function PendingBell({ light = false }: { light?: boolean }) {
  const { envelope } = useStore();
  const pending = envelope?.status === "pending_approval";
  return (
    <Link
      href="/plan"
      className={`relative grid h-11 w-11 place-items-center rounded-full transition ${light ? "text-ink-soft hover:bg-lav-50" : "text-ink-soft hover:bg-white"}`}
      aria-label={pending ? "承認待ちのプランがあります" : "通知"}
    >
      <Bell className={`h-5 w-5 ${pending ? "origin-top animate-[wave_0.5s_ease-in-out_6_alternate]" : ""}`} strokeWidth={1.7} />
      {pending && <span className="pulse-ring absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-400" />}
    </Link>
  );
}

function OshiColorPicker() {
  const { oshiColor, setOshiColor } = useStore();
  return (
    <fieldset>
      <legend className="text-[10px] font-bold tracking-[0.25em] text-white/50">OSHI COLOR</legend>
      <div className="mt-2.5 flex gap-2.5">
        {OSHI_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOshiColor(c.id)}
            aria-pressed={oshiColor === c.id}
            aria-label={`推しカラーを${c.label}にする`}
            className="grid h-7 w-7 place-items-center rounded-full transition hover:scale-110"
            style={{ boxShadow: oshiColor === c.id ? `0 0 0 2px #1b1935, 0 0 0 3.5px ${c.hex}, 0 0 16px 2px ${c.hex}` : "none" }}
          >
            <span className="h-5 w-5 rounded-full" style={{ background: c.hex }} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** 画面上部を流れるティッカー。登録済みイベントを開催日順に流す（登録内容に連動） */
function LiveTicker() {
  const { events, event, busy } = useStore();
  const now = useNow();
  const upcoming = events.filter((e) => now === null || Date.parse(e.startAt) >= now - 6 * 3_600_000);
  const dday = (iso: string) => (now === null ? "D-—" : `D-${Math.max(0, Math.floor((Date.parse(iso) - now) / 86_400_000))}`);

  const items: { text: string; strong?: boolean }[] =
    upcoming.length === 0
      ? [
          { text: busy === "importing" ? "カレンダーからライブを探しています…" : "イベント未登録", strong: true },
          { text: "Google カレンダーを連携すると、ライブ・公演を自動で取り込みます" },
          { text: "推しに会う日は、もっと特別に ♡" },
        ]
      : upcoming.flatMap((e, i) => [
          { text: i === 0 ? "NEXT LIVE" : "COMING UP", strong: true },
          { text: e.title.toLowerCase().includes(e.artist.toLowerCase()) ? e.title : `${e.artist}｜${e.title}`, strong: e.id === event?.id },
          { text: `${formatJst(e.startAt)}${e.timeUnknown ? "（時刻未定）" : ""}` },
          { text: e.venue },
          { text: dday(e.startAt), strong: true },
        ]);
  // 流れる帯が短すぎないよう、少ない場合は繰り返す
  const repeated = items.length < 8 ? [...items, { text: "Good Travel, Good Live" }, ...items] : items;
  const row = (
    <div className="flex shrink-0 items-center">
      {repeated.map((t, i) => (
        <span key={i} className={`flex items-center whitespace-nowrap px-5 text-[11px] tracking-[0.18em] ${t.strong ? "font-bold text-white" : "text-white/70"}`}>
          {t.text}
          <span className="ml-10 h-1 w-1 rounded-full bg-rose-400" />
        </span>
      ))}
    </div>
  );
  const label = upcoming.length
    ? `登録イベント: ${upcoming.map((e) => `${e.title} ${formatJst(e.startAt)}`).join("、")}`
    : "イベント未登録";
  return (
    <div className="relative overflow-hidden bg-night py-2" aria-label={label}>
      <div key={upcoming.map((e) => e.id).join("|")} className="marquee" style={{ "--marquee-duration": `${Math.max(30, repeated.length * 4)}s` } as CSSProperties} aria-hidden>
        {row}
        {row}
      </div>
    </div>
  );
}

function ErrorToast() {
  const { error, clearError } = useStore();
  if (!error) return null;
  return (
    <div role="alert" className="pop-in fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-ink shadow-float lg:bottom-8">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
      <p className="flex-1">{error}</p>
      <button onClick={clearError} className="grid h-8 w-8 place-items-center text-mute hover:text-ink" aria-label="閉じる">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * アプリ全体のレイアウト。
 * 左: 夜のステージをモチーフにしたサイドバー（ナビ＋推しカラー）、右: ティッカー＋コンテンツ。
 * data-oshi で推しカラー（アクセント）を全画面に適用する。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isActive = useActive();
  const { oshiColor } = useStore();
  return (
    <div data-oshi={oshiColor} className="min-h-screen lg:flex">
      <aside className="stage sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden px-5 py-7 text-white lg:flex">
        <div className="beam left-[20%] opacity-40" style={{ animationDuration: "11s" }} />
        <div className="noise pointer-events-none absolute inset-0" />
        <Link href="/" aria-label="ホーム" className="relative px-2">
          <Logo tone="light" />
        </Link>
        <nav className="relative mt-12 flex flex-col gap-1" aria-label="メイン">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition ${active ? "bg-white/10 font-bold text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
              >
                {/* ペンライト型のアクティブインジケーター */}
                <span
                  className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-rose-400 transition-all duration-500 ${active ? "opacity-100 shadow-[0_0_12px_3px_rgb(var(--oshi-glow))]" : "scale-y-0 opacity-0"}`}
                />
                <n.icon className="h-5 w-5 transition group-hover:scale-110" strokeWidth={active ? 2.1 : 1.7} />
                <span className="flex-1">{n.label}</span>
                <span className="font-display text-sm italic text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/60">{n.en}</span>
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto space-y-6">
          <OshiColorPicker />
          <div className="border-t border-white/10 pt-5">
            <p className="font-display text-[26px] italic leading-tight text-white/90">
              Good Travel,
              <br />
              <span className="pl-5">Good Live ♡</span>
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/45">予定や画像はこの画面の中だけで使い、閉じると消えます。</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <LiveTicker />
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-white/85 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/" aria-label="ホーム">
            <Logo />
          </Link>
          <PendingBell light />
        </header>

        <main className="mx-auto max-w-[1240px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-14 lg:pt-6">
          <Suspense>
            <CalendarConnectNotice />
          </Suspense>
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl bg-night/95 pb-[env(safe-area-inset-bottom)] text-white shadow-float backdrop-blur lg:hidden" aria-label="メイン（モバイル）">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] ${active ? "font-bold text-white" : "text-white/55"}`}>
              {active && <span className="absolute top-1.5 h-1 w-5 rounded-full bg-rose-400 shadow-[0_0_10px_2px_rgb(var(--oshi-glow))]" />}
              <n.icon className="h-5 w-5" strokeWidth={active ? 2.1 : 1.7} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <ErrorToast />
    </div>
  );
}

export { PendingBell };

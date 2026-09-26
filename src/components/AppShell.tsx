"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ClipboardList, Heart, House, MapPin, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./brand";
import { useStore } from "./store";

const NAV = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plan", label: "プラン", icon: ClipboardList },
  { href: "/bookings", label: "予約", icon: MapPin },
  { href: "/settings", label: "設定", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

function PendingBell() {
  const { envelope } = useStore();
  const pending = envelope?.status === "pending_approval";
  return (
    <Link href="/plan" className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-lav-50" aria-label={pending ? "承認待ちのプランがあります" : "通知"}>
      <Bell className="h-5 w-5" strokeWidth={1.7} />
      {pending && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-400 ring-2 ring-white" />}
    </Link>
  );
}

function Avatar() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-lav-200 ring-2 ring-white shadow" aria-hidden>
      <Heart className="h-5 w-5 fill-rose-300 text-rose-400" />
    </span>
  );
}

function ErrorToast() {
  const { error, clearError } = useStore();
  if (!error) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-ink shadow-float lg:bottom-8">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
      <p className="flex-1">{error}</p>
      <button onClick={clearError} className="text-mute hover:text-ink" aria-label="閉じる">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * アプリ全体のレイアウト。デザインモックの「アプリ画面の枠内」だけを全画面化したもの:
 * 左にサイドバー（ロゴ・ナビ）、右にヘッダー（通知・アバター）とコンテンツ。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isActive = useActive();
  return (
    <div className="min-h-screen bg-white lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 bg-white px-5 py-7 lg:flex">
        <Link href="/" aria-label="ホーム" className="px-2">
          <Logo />
        </Link>
        <nav className="mt-10 flex flex-col gap-1.5" aria-label="メイン">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition ${
                isActive(n.href) ? "bg-lav-100 font-bold text-lav-700" : "text-ink-soft hover:bg-lav-50"
              }`}
              aria-current={isActive(n.href) ? "page" : undefined}
            >
              <n.icon className="h-5 w-5" strokeWidth={isActive(n.href) ? 2.2 : 1.7} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-gradient-to-br from-rose-50 to-lav-50 p-4">
          <p className="font-script text-2xl leading-tight text-ink-soft">
            Good Travel
            <br />
            &nbsp;&nbsp;Good Live ♡
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-mute">データはメモリ上でのみ処理。ページを閉じると消去されます。</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-cloud/60">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" aria-label="ホーム">
            <Logo />
          </Link>
          <PendingBell />
        </header>

        <main className="mx-auto max-w-[1200px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-6">
          <div className="mb-2 hidden items-center justify-end gap-3 lg:flex">
            <PendingBell />
            <Avatar />
          </div>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="メイン（モバイル）">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive(n.href) ? "font-bold text-lav-700" : "text-mute"}`}>
            <n.icon className="h-5 w-5" strokeWidth={isActive(n.href) ? 2.2 : 1.7} />
            {n.label}
          </Link>
        ))}
      </nav>
      <ErrorToast />
    </div>
  );
}

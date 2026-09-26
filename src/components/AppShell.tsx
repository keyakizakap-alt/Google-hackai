"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ClipboardList, Heart, House, Lock, MapPin, Settings, ShieldCheck, Sparkles, TrainFront, CalendarPlus, X } from "lucide-react";
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

function BrandHeader() {
  const steps = [
    { icon: CalendarPlus, n: "01", t: "空き時間から\nプランを提案" },
    { icon: Sparkles, n: "02", t: "美容プランも\nまとめて作成" },
    { icon: TrainFront, n: "03", t: "移動プランで\n当日も安心" },
  ];
  return (
    <header className="relative hidden items-end justify-between gap-8 pb-8 pt-2 lg:flex">
      <div>
        <p className="text-[15px] tracking-[0.18em] text-ink-soft">推しに会う日を、いちばん気持ちよく迎える。</p>
        <div className="mt-1">
          <span className="font-display text-[64px] font-semibold italic leading-none text-ink">
            Oshi<span className="relative">R<span className="absolute -top-2 left-3 text-lg not-italic text-rose-400">✿</span></span>eady
          </span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed tracking-[0.12em] text-ink-soft">
          予定・移動・美容の準備まで、
          <br />
          推し活のスケジュールをまるっとプランニング。
        </p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <p className="font-script hidden -rotate-6 pr-6 text-[28px] leading-tight text-ink-soft xl:block">推しに会う日は、もっと特別に ♡</p>
        <ol className="flex items-start gap-4 pb-2" aria-label="OshiReady の 3 ステップ">
          {steps.map((s, i) => (
            <li key={s.n} className="flex items-start gap-4">
              <div className="flex w-32 flex-col items-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-rose-100 to-lav-100 text-lav-600 shadow-[0_8px_24px_-12px_rgb(120_90_170/0.6)]">
                  <s.icon className="h-7 w-7" strokeWidth={1.6} />
                </span>
                <span className="mt-2 text-xs font-semibold text-ink">{s.n}</span>
                <span className="mt-1 whitespace-pre-line text-[13px] font-medium leading-snug text-ink">{s.t}</span>
              </div>
              {i < steps.length - 1 && <span className="mt-6 text-2xl text-lav-400">→</span>}
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}

function TrustFooter() {
  const items = [
    { icon: ShieldCheck, t: "個人情報は保存しません", d: "カレンダーのデータは一時処理のみで、サーバーに保存しません。" },
    { icon: Lock, t: "予約は承認後のみ", d: "提案後に、あなたの確認・承認をしてから予約を行います。" },
    { icon: Heart, t: "推し活に寄り添うパートナー", d: "予定・移動・美容の準備まで、あなたの推し活をやさしくサポート。" },
  ];
  return (
    <footer className="grid gap-4 pb-24 pt-8 sm:grid-cols-3 lg:pb-10">
      {items.map((it) => (
        <div key={it.t} className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lav-100 text-lav-600">
            <it.icon className="h-6 w-6" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[15px] font-bold text-ink">{it.t}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{it.d}</p>
          </div>
        </div>
      ))}
    </footer>
  );
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
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
      <p className="flex-1">{error}</p>
      <button onClick={clearError} className="text-mute hover:text-ink" aria-label="閉じる">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isActive = useActive();
  return (
    <div className="bg-dreamy relative min-h-screen overflow-x-hidden">
      {/* 桜の花びら（装飾） */}
      <span className="petal left-[3%] top-[38%] hidden h-5 w-7 rotate-12 lg:block" />
      <span className="petal left-[1%] top-[62%] hidden h-4 w-6 -rotate-12 lg:block" />
      <span className="petal right-[2%] top-[46%] hidden h-4 w-6 rotate-45 lg:block" />

      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8 lg:pt-6">
        <BrandHeader />

        {/* Mobile header */}
        <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" aria-label="ホーム">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <PendingBell />
          </div>
        </div>

        <div className="relative flex overflow-hidden rounded-none border-line bg-white/85 backdrop-blur lg:min-h-[760px] lg:rounded-[30px] lg:border lg:shadow-float">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-line/70 px-5 py-7 lg:flex">
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
              <p className="font-script text-2xl leading-tight text-ink-soft">Good Travel<br />&nbsp;&nbsp;Good Live ♡</p>
              <p className="mt-2 text-[11px] leading-relaxed text-mute">データはメモリ上でのみ処理。ページを閉じると消去されます。</p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-0 py-5 sm:px-2 lg:px-8 lg:py-7">
            <div className="mb-2 hidden items-center justify-end gap-3 lg:flex">
              <PendingBell />
              <Avatar />
            </div>
            {children}
          </main>
        </div>

        <TrustFooter />
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

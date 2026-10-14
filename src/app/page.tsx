"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarPlus, Heart, ImagePlus, LoaderCircle, MapPin, RefreshCw } from "lucide-react";
import { PendingBell } from "@/components/AppShell";
import { GoogleG } from "@/components/brand";
import { DemoCalendarButton, GoogleConnectButton, useCalendarLinks } from "@/components/CalendarConnect";
import { MiniCalendar } from "@/components/MiniCalendar";
import { CountUp, Reveal, TickDigits, useCountdown } from "@/components/motion";
import { PlanSummaryCard } from "@/components/PlanSummary";
import { RemindersCard } from "@/components/Reminders";
import { CalendarChangeBanner, ConflictBanner, WatchCard } from "@/components/AgentInsights";
import { NextSteps } from "@/components/FirstSteps";
import { ScanImportButton } from "@/components/ScanImport";
import { StageScene } from "@/components/StageScene";
import { useStore } from "@/components/store";
import type { OshiEvent } from "@/lib/agent/types";
import { formatJst } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");

/** チケット型ヒーロー: 左にステージ、右の半券に開演までのライブカウントダウン */
function TicketHero({ event, className = "" }: { event: OshiEvent; className?: string }) {
  const { eventImage, setEventImage } = useStore();
  const cd = useCountdown(event.startAt);
  return (
    <Reveal as="section" aria-labelledby="next-event" className={`glow-border grid overflow-hidden rounded-[22px] bg-night text-white shadow-float md:grid-cols-[1fr_260px] ${className}`}>
      <div className="relative min-h-[260px] overflow-hidden md:min-h-[300px] fit:min-h-0">
        {eventImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL（メモリ上のみ）
          <img src={eventImage} alt={`${event.artist} の推し画像`} className="kenburns absolute inset-0 h-full w-full object-cover" />
        ) : (
          <StageScene className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-transparent" />
        <div className="relative flex h-full flex-col justify-between gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.3em] backdrop-blur">NEXT LIVE</span>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 text-xs font-bold backdrop-blur transition hover:bg-white/20">
              <ImagePlus className="h-4 w-4" />
              {eventImage ? "推し画像を変更" : "推し画像を入れる"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setEventImage(f);
                }}
              />
            </label>
          </div>
          <div>
            <p className="font-display truncate text-lg italic text-white/70">{event.artist}</p>
            <h2 id="next-event" className="mt-1 line-clamp-2 [word-break:auto-phrase] text-[26px] font-bold leading-tight tracking-wide sm:text-[32px]">
              {event.title}
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <span className="shrink-0 rounded-full bg-white/12 px-3 py-1.5 backdrop-blur">{formatJst(event.startAt)} 開演</span>
              <span className="flex min-w-0 max-w-full items-center gap-1 rounded-full bg-white/12 px-3 py-1.5 backdrop-blur">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{event.venue}</span>
              </span>
              <Link href="/events" className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 font-bold text-ink transition hover:bg-rose-50">
                詳細を編集 <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 半券 */}
      <div className="relative flex flex-col justify-between bg-paper p-6 text-ink">
        <span className="ticket-perf absolute inset-y-0 left-0 hidden w-3 -translate-x-1/2 md:block" aria-hidden />
        <span className="ticket-perf absolute inset-x-0 top-0 h-3 -translate-y-1/2 rotate-0 md:hidden" style={{ backgroundSize: "16px 100%" }} aria-hidden />
        <div>
          <p className="text-[10px] font-bold tracking-[0.3em] text-mute">COUNTDOWN</p>
          <p className="mt-2 flex items-baseline gap-2" aria-live="off" aria-label={`開演まであと${cd.days}日`}>
            <span className="font-display text-[84px] font-semibold leading-[0.8] text-ink [@media(max-height:56rem)]:fit:text-[68px]">
              <TickDigits value={cd.ready ? String(cd.days) : "–"} />
            </span>
            <span className="font-display text-2xl italic text-rose-400">days</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              [cd.hours, "HRS"],
              [cd.minutes, "MIN"],
              [cd.seconds, "SEC"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-cloud py-2">
                <p className="font-display text-xl font-semibold text-ink">
                  <TickDigits value={cd.ready ? pad(v as number) : "--"} />
                </p>
                <p className="text-[9px] font-bold tracking-[0.25em] text-mute">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-dashed border-line pt-3 [@media(max-height:52rem)]:fit:hidden">
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] text-mute">ADMIT ONE</p>
            <p className="font-display text-lg italic text-ink">OshiReady</p>
          </div>
          <div className="flex gap-[2px]" aria-hidden>
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="bg-ink" style={{ width: i % 3 === 0 ? 3 : 1, height: 28 }} />
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/** 登録済みイベントの切り替え（カレンダー取り込み分にはバッジ） */
function EventSwitcher() {
  const { events, event, selectEvent, lastImport, busy, imageFor } = useStore();
  if (events.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <p className="hidden shrink-0 text-[10px] font-bold tracking-[0.25em] text-mute sm:block">MY LIVES · {events.length}</p>
      <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:px-0" role="tablist" aria-label="登録イベント">
        {events.map((e) => {
          const active = e.id === event?.id;
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={active}
              onClick={() => selectEvent(e.id)}
              className={`group flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-left transition ${active ? "border-transparent bg-night text-white shadow-float" : "border-line bg-white text-ink hover:border-rose-300"}`}
            >
              {imageFor(e) ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL（端末内のみ）
                <img src={imageFor(e)!} alt="" className={`h-7 w-7 rounded-full object-cover ${active ? "ring-2 ring-rose-400" : ""}`} />
              ) : (
                <span className={`h-2 w-2 rounded-full ${active ? "bg-rose-400 shadow-[0_0_10px_2px_rgb(var(--oshi-glow))]" : "bg-lav-200"}`} />
              )}
              <span className="text-[13px] font-bold">{e.artist}</span>
              <span className={`text-[11px] ${active ? "text-white/60" : "text-mute"}`}>{formatJst(e.startAt, { date: true })}</span>
              {e.source === "calendar" && <GoogleG className="h-3.5 w-3.5" />}
            </button>
          );
        })}
        <ScanImportButton label="スクショで追加" className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-lav-200 px-3.5 text-[13px] text-ink-soft hover:border-rose-300" />
      </div>
      {lastImport && lastImport.added > 0 && busy !== "importing" && (
        <p className="pop-in hidden shrink-0 text-[11px] text-ink-soft xl:block">
          カレンダーから <b className="text-rose-500">{lastImport.added}件</b> 取り込みました
        </p>
      )}
    </div>
  );
}

function EmptyHero({ className = "" }: { className?: string }) {
  const { session, busy, importFromCalendar, lastImport } = useStore();
  const { demoAvailable } = useCalendarLinks();
  const importing = busy === "importing";
  const nothingFound = !importing && session?.calendarConnected && lastImport && lastImport.found === 0;
  return (
    <Reveal as="section" className={`relative grid overflow-hidden rounded-[22px] bg-night text-white shadow-float md:grid-cols-[1fr_1fr] ${className}`}>
      <StageScene className="relative min-h-[220px] fit:min-h-0" />
      <div className="flex flex-col justify-center gap-4 overflow-y-auto p-7">
        <p className="text-[10px] font-bold tracking-[0.3em] text-white/50">NO LIVE YET</p>
        <h2 className="text-2xl font-bold leading-snug">
          {importing ? "カレンダーからライブを探しています…" : nothingFound ? "カレンダーにライブの予定が見つかりませんでした" : "まだイベントが登録されていません"}
        </h2>
        <p className="text-sm leading-relaxed text-white/65">
          {nothingFound
            ? `今後 6 か月の予定 ${lastImport.scanned} 件を確認しました。予定のタイトルに公演名や会場名（例: 東京ドーム）が入っていると見つけやすくなります。スクショや手入力でも登録できます。`
            : "Google カレンダーを連携するか、カレンダーやチケット画面のスクショを選ぶだけで、ライブを自動で登録します。"}
        </p>
        <div className="flex flex-wrap gap-2">
          {!session?.calendarConnected ? (
            <>
              <GoogleConnectButton className="btn-primary rounded-xl px-5 py-3 text-sm font-bold ring-1 ring-white/20" label="Google カレンダーと連携" />
              {demoAvailable && <DemoCalendarButton className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-night hover:bg-white/90" />}
            </>
          ) : (
            <button onClick={() => void importFromCalendar()} disabled={busy !== null} className="btn-primary flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ring-1 ring-white/20">
              {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {importing ? "探しています…" : nothingFound ? "もう一度探す" : "カレンダーから取り込む"}
            </button>
          )}
          <ScanImportButton className="flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-bold text-white hover:bg-white/10" />
          <Link href="/events" className="rounded-xl px-4 py-3 text-sm text-white/70 underline-offset-4 hover:underline">
            手で入力する
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

function Hero({ className = "" }: { className?: string }) {
  const { event } = useStore();
  return event ? <TicketHero key={event.id} event={event} className={className} /> : <EmptyHero className={className} />;
}

function CalendarCard({ className = "" }: { className?: string }) {
  const { session, availability, busy, extractAvailability, event } = useStore();
  const connected = session?.calendarConnected;
  const { demoAvailable, demoConnected } = useCalendarLinks();
  const scanning = busy === "availability";
  const stats = connected && availability;
  return (
    <Reveal delay={120} as="section" aria-labelledby="gcal" className={`card flex min-h-0 flex-col p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm italic text-mute">Free time</p>
          <h2 id="gcal" className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <GoogleG className="h-4.5 w-4.5 shrink-0" />
            空き時間
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${connected ? "bg-rose-50 text-rose-500" : "bg-lav-50 text-lav-600"}`}>{demoConnected ? "デモ表示中" : connected ? "連携済み" : "未連携"}</span>
          {/* 未連携のときは確認できる予定がないため、更新ボタンは出さずに連携を案内する（押しても意味のないボタンを置かない） */}
          {connected && event && (
            <button
              type="button"
              onClick={() => void extractAvailability()}
              disabled={busy !== null}
              title={availability ? "空き時間を最新にする" : "空き時間を確認する"}
              aria-label={availability ? "空き時間を最新にする" : "空き時間を確認する"}
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-soft transition hover:bg-lav-50 disabled:opacity-50"
            >
              {scanning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <div className={`mt-3 grid min-h-0 flex-1 gap-3 ${session && !connected ? "grid-cols-[minmax(0,1fr)_120px]" : "grid-cols-[minmax(0,1fr)_96px]"}`}>
        {event ? (
          <MiniCalendar availability={connected ? availability : null} eventDate={event.startAt} scanning={scanning} />
        ) : (
          <div className="grid place-items-center rounded-2xl bg-cloud p-4 text-center text-xs text-mute">ライブを登録すると、空き時間のカレンダーが出ます</div>
        )}
        {session && !connected ? (
          <div className="flex flex-col justify-center gap-2">
            <GoogleConnectButton className="btn-primary min-h-[40px] rounded-xl px-2 text-[11px] font-bold" label="連携する" />
            {demoAvailable && <DemoCalendarButton className="min-h-[40px] rounded-xl border border-line px-2 text-[11px] font-bold text-ink hover:bg-lav-50" label="デモで試す" />}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex-1 rounded-2xl bg-cloud px-3 py-2">
              <p className="text-[10px] font-bold text-mute">空き（枠）</p>
              <p className="font-display text-3xl font-semibold leading-tight text-ink">{stats ? <CountUp to={availability.freeSlots.length} /> : "—"}</p>
            </div>
            <div className="flex-1 rounded-2xl bg-cloud px-3 py-2">
              <p className="text-[10px] font-bold text-mute">予定（件）</p>
              <p className="font-display text-3xl font-semibold leading-tight text-ink">{stats ? <CountUp to={availability.busyCount} /> : "—"}</p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 truncate text-[11px] text-mute" title="空き時間は予定の「時間」だけから計算します。予定の中身はライブを探すときだけ確認し、保存はしません。">
        {demoConnected ? "デモのカレンダー（架空の予定）を表示しています" : connected ? "予定の時間だけを見ます。書き換え・保存はしません" : "未連携のため、既存の予定との重なりは確認できません"}
      </p>
    </Reveal>
  );
}

function Greeting() {
  const { eventImage } = useStore();
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }));
  const hello = h < 11 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex items-center justify-between gap-4">
      <Reveal className="flex flex-col xl:flex-row xl:items-baseline xl:gap-4">
        <p className="font-display text-lg italic leading-none text-mute" suppressHydrationWarning>
          {hello},
        </p>
        <h1 className="mt-1.5 text-2xl font-bold leading-snug tracking-wide text-ink sm:text-[26px] xl:mt-0">
          推しに会う日を、
          <br className="sm:hidden" />
          <span className="relative isolate whitespace-nowrap">
            いちばん気持ちよく
            <span className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded bg-rose-100" aria-hidden />
          </span>
          迎えよう。
        </h1>
      </Reveal>
      <div className="hidden items-center gap-2 lg:flex">
        <PendingBell />
        {eventImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL（メモリ上のみ）
          <img src={eventImage} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-rose-300" />
        ) : (
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-lav-200 ring-2 ring-white" aria-hidden>
            <Heart className="h-5 w-5 fill-rose-300 text-rose-400" />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ホーム。横 1280px・縦 700px 以上の画面では、スクロールせずに一画面に収める（fit）。
 *   ┌────────────── ヒーロー ──────────────┬ 提案プラン ┐
 *   ├──── 次にやること ────┬─── 空き時間 ───┤ リマインド ┘
 * 下の段は中身の高さに合わせ、残りの高さをヒーローに使う（低い画面ではヒーローが縮む）。
 * それより狭い画面では、上から順に並べる（スマホではヒーロー → 次にやること → プラン → 空き時間 → リマインド）。
 */
export default function Home() {
  return (
    <div className="flex flex-col gap-4 fit:h-[calc(100dvh-5.625rem)]">
      <Greeting />
      <EventSwitcher />
      <CalendarChangeBanner />
      <ConflictBanner />
      <WatchCard />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-12 fit:min-h-0 fit:flex-1 fit:grid-rows-[minmax(0,1fr)_auto]">
        <Hero className="xl:col-span-8 xl:col-start-1 xl:row-start-1" />
        <NextSteps className="xl:col-span-4 xl:col-start-1 xl:row-start-2" />
        <div className="flex min-h-0 flex-col gap-4 xl:col-span-4 xl:col-start-9 xl:row-span-2 xl:row-start-1">
          <PlanSummaryCard className="min-h-0 flex-1" />
          <RemindersCard className="shrink-0" />
        </div>
        <CalendarCard className="xl:col-span-4 xl:col-start-5 xl:row-start-2" />
      </div>
    </div>
  );
}

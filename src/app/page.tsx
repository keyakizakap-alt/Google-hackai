"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarPlus, Heart, ImagePlus, LoaderCircle, MapPin, Sparkles, TrainFront } from "lucide-react";
import { useState } from "react";
import { PendingBell } from "@/components/AppShell";
import { GoogleG } from "@/components/brand";
import { MiniCalendar } from "@/components/MiniCalendar";
import { CountUp, Reveal, TickDigits, useCountdown } from "@/components/motion";
import { PlanSummaryCard } from "@/components/PlanSummary";
import { ScanImportButton } from "@/components/ScanImport";
import { StageScene } from "@/components/StageScene";
import { useStore } from "@/components/store";
import type { OshiEvent } from "@/lib/agent/types";
import { formatJst } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");

/** チケット型ヒーロー: 左にステージ、右の半券に開演までのライブカウントダウン */
function TicketHero({ event }: { event: OshiEvent }) {
  const { eventImage, setEventImage } = useStore();
  const cd = useCountdown(event.startAt);
  const [liked, setLiked] = useState(true);
  return (
    <Reveal as="section" aria-labelledby="next-event" className="glow-border grid overflow-hidden rounded-[22px] bg-night text-white shadow-float md:grid-cols-[1fr_300px]">
      <div className="relative min-h-[300px] overflow-hidden md:min-h-[340px]">
        {eventImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL（メモリ上のみ）
          <img src={eventImage} alt={`${event.artist} の推し画像`} className="kenburns absolute inset-0 h-full w-full object-cover" />
        ) : (
          <StageScene className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.3em] backdrop-blur">NEXT LIVE</span>
            <div className="flex items-center gap-2">
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
            <button
              type="button"
              onClick={() => setLiked((v) => !v)}
              aria-pressed={liked}
              aria-label="お気に入り"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-rose-400 shadow-lg transition hover:scale-110 active:scale-95"
            >
              <Heart className={`h-5 w-5 transition ${liked ? "fill-rose-400" : ""}`} />
            </button>
            </div>
          </div>
          <div>
            <p className="font-display text-lg italic text-white/70">{event.artist}</p>
            <h2 id="next-event" className="mt-1 text-[26px] font-bold leading-tight tracking-wide sm:text-4xl">
              {event.title}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-white/12 px-3 py-1.5 backdrop-blur">{formatJst(event.startAt)} 開演</span>
              <span className="flex items-center gap-1 rounded-full bg-white/12 px-3 py-1.5 backdrop-blur">
                <MapPin className="h-3.5 w-3.5" />
                {event.venue}
              </span>
              <Link href="/events" className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-bold text-ink transition hover:bg-rose-50">
                詳細を編集 <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 半券 */}
      <div className="relative flex flex-col justify-between bg-paper p-6 text-ink sm:p-7">
        <span className="ticket-perf absolute inset-y-0 left-0 hidden w-3 -translate-x-1/2 md:block" aria-hidden />
        <span className="ticket-perf absolute inset-x-0 top-0 h-3 -translate-y-1/2 rotate-0 md:hidden" style={{ backgroundSize: "16px 100%" }} aria-hidden />
        <div>
          <p className="text-[10px] font-bold tracking-[0.3em] text-mute">COUNTDOWN</p>
          <p className="mt-2 flex items-baseline gap-2" aria-live="off" aria-label={`開演まであと${cd.days}日`}>
            <span className="font-display text-[92px] font-semibold leading-[0.8] text-ink">
              <TickDigits value={cd.ready ? String(cd.days) : "–"} />
            </span>
            <span className="font-display text-2xl italic text-rose-400">days</span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [cd.hours, "HRS"],
              [cd.minutes, "MIN"],
              [cd.seconds, "SEC"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-cloud py-2">
                <p className="font-display text-2xl font-semibold text-ink">
                  <TickDigits value={cd.ready ? pad(v as number) : "--"} />
                </p>
                <p className="text-[9px] font-bold tracking-[0.25em] text-mute">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between border-t border-dashed border-line pt-4">
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[10px] font-bold tracking-[0.25em] text-mute">MY LIVES · {events.length}</p>
        {lastImport && lastImport.added > 0 && busy !== "importing" && (
          <p className="pop-in text-[11px] text-ink-soft">
            Google カレンダーから <b className="text-rose-500">{lastImport.added}件</b> のライブを取り込みました
          </p>
        )}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="登録イベント">
        {events.map((e) => {
          const active = e.id === event?.id;
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={active}
              onClick={() => selectEvent(e.id)}
              className={`group flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-full border px-4 py-2 text-left transition ${active ? "border-transparent bg-night text-white shadow-float" : "border-line bg-white text-ink hover:border-rose-300"}`}
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
        <ScanImportButton label="スクショで追加" className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-lav-200 px-4 text-[13px] text-ink-soft hover:border-rose-300" />
      </div>
    </div>
  );
}

function EmptyHero() {
  const { session, busy, importFromCalendar } = useStore();
  const importing = busy === "importing";
  return (
    <Reveal as="section" className="relative grid overflow-hidden rounded-[22px] bg-night text-white shadow-float md:grid-cols-[1fr_1fr]">
      <StageScene className="relative min-h-[240px]" />
      <div className="flex flex-col justify-center gap-4 p-7 sm:p-9">
        <p className="text-[10px] font-bold tracking-[0.3em] text-white/50">NO LIVE YET</p>
        <h2 className="text-2xl font-bold leading-snug">
          {importing ? "カレンダーからライブを探しています…" : "まだイベントが登録されていません"}
        </h2>
        <p className="text-sm leading-relaxed text-white/65">
          Google カレンダーを連携するか、カレンダーやチケット画面のスクショを選ぶだけで、ライブを自動で登録します。
        </p>
        <div className="flex flex-wrap gap-2">
          {session?.googleOAuthConfigured && !session.calendarConnected ? (
            <a href="/api/auth/google" className="btn-primary flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ring-1 ring-white/20">
              <GoogleG className="h-4 w-4" /> Google カレンダーを連携
            </a>
          ) : (
            <button onClick={() => void importFromCalendar()} disabled={busy !== null} className="btn-primary flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ring-1 ring-white/20">
              {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              カレンダーから取り込む
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

function Hero() {
  const { event } = useStore();
  return event ? <TicketHero key={event.id} event={event} /> : <EmptyHero />;
}

function CalendarCard() {
  const { session, availability, busy, extractAvailability, event } = useStore();
  const connected = session?.calendarConnected;
  const scanning = busy === "availability";
  return (
    <Reveal delay={120} as="section" aria-labelledby="gcal" className="card card-lift flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-mute">Free time</p>
          <h2 id="gcal" className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <GoogleG className="h-5 w-5" />
            Googleカレンダーと連携
          </h2>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${connected ? "bg-rose-50 text-rose-500" : "bg-lav-50 text-lav-600"}`}>{connected ? "連携済み" : "未連携"}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">空き時間は予定の「時間」だけから計算します。予定の中身はライブを探すときだけ確認し、保存はしません。</p>

      <div className="mt-4 grid flex-1 gap-4 sm:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col justify-between gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-cloud p-3">
              <p className="text-[11px] font-bold text-mute">使える空き時間</p>
              <p className="font-display text-4xl font-semibold text-ink">{availability ? <CountUp to={availability.freeSlots.length} /> : "—"}</p>
            </div>
            <div className="rounded-2xl bg-cloud p-3">
              <p className="text-[11px] font-bold text-mute">入っている予定</p>
              <p className="font-display text-4xl font-semibold text-ink">{availability ? <CountUp to={availability.busyCount} /> : "—"}</p>
            </div>
          </div>
          {!connected && session?.googleOAuthConfigured ? (
            <a href="/api/auth/google" className="text-xs font-bold text-lav-600 underline-offset-4 hover:underline">
              Google アカウントを連携する →
            </a>
          ) : (
            <p className="text-[11px] leading-relaxed text-mute">{connected ? "予定を見るだけで、書き換えることはありません" : "未連携のため、既存予定との重なりは確認できません"}</p>
          )}
        </div>
        {event ? (
          <MiniCalendar availability={availability} eventDate={event.startAt} scanning={scanning} />
        ) : (
          <div className="grid place-items-center rounded-2xl bg-cloud p-4 text-center text-xs text-mute">イベントを登録するとヒートマップが表示されます</div>
        )}
      </div>

      <button onClick={() => void extractAvailability()} disabled={busy !== null} className="btn-primary mt-5 flex w-full items-center justify-center gap-3 rounded-xl py-3.5 text-[15px] font-bold">
        {scanning ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" strokeWidth={1.7} />}
        {scanning ? "スキャン中…" : "空き時間を抽出"}
      </button>
    </Reveal>
  );
}

/** 「次にやること」をライブのセットリストとして表現 */
function Setlist() {
  const { availability, envelope, busy, generatePlan } = useStore();
  const router = useRouter();
  const steps = [
    { icon: CalendarPlus, t: "空き時間を確認", d: "カレンダーから空き時間を抽出", done: Boolean(availability) },
    { icon: Sparkles, t: "美容プランを作成", d: "美容・施術の候補を逆算して提案", done: Boolean(envelope) },
    { icon: TrainFront, t: "移動プランを作成", d: "混雑を避けた出発時間・ルート", done: Boolean(envelope) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const onStep = async (i: number) => {
    if (i === 0) return document.getElementById("gcal")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (envelope) return router.push("/plan");
    if (await generatePlan()) router.push("/plan");
  };
  return (
    <Reveal delay={80} as="section" aria-labelledby="setlist" className="card p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-display text-sm italic text-mute">Tonight&apos;s Setlist</p>
          <h2 id="setlist" className="text-[17px] font-bold text-ink">次にやること</h2>
        </div>
        <p className="font-display text-3xl font-semibold text-ink">
          {doneCount}
          <span className="text-base italic text-mute"> / 3</span>
        </p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-lav-50">
        <div className="h-full rounded-full bg-gradient-to-r from-lav-400 to-rose-400 transition-all duration-1000" style={{ width: `${(doneCount / 3) * 100}%` }} />
      </div>
      <ol className="mt-4 divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.t}>
            <button
              onClick={() => void onStep(i)}
              disabled={busy !== null}
              className="group flex w-full items-center gap-4 py-4 text-left transition disabled:opacity-60"
            >
              <span className={`font-display w-10 shrink-0 text-2xl italic transition ${s.done ? "text-rose-400" : "text-lav-200 group-hover:text-lav-500"}`}>M{i + 1}</span>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition duration-300 group-hover:scale-110 ${s.done ? "bg-rose-400 text-white" : "bg-lav-50 text-lav-600 group-hover:bg-night group-hover:text-white"}`}>
                {busy === "planning" && i > 0 ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <s.icon className="h-5 w-5" strokeWidth={1.7} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink transition group-hover:translate-x-1">{s.t}</span>
                <span className="block text-xs text-mute">{s.d}</span>
              </span>
              <span className="text-[10px] font-bold tracking-[0.2em] text-mute">{s.done ? "DONE" : i === doneCount ? "NEXT" : ""}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-mute transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

function Greeting() {
  const { eventImage } = useStore();
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }));
  const hello = h < 11 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex items-start justify-between gap-4">
      <Reveal>
        <p className="font-display text-xl italic text-mute" suppressHydrationWarning>
          {hello},
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-snug tracking-wide text-ink sm:text-[32px]">
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

export default function Home() {
  return (
    <div className="space-y-6">
      <Greeting />
      <EventSwitcher />
      <Hero />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <CalendarCard />
        <PlanSummaryCard />
      </div>
      <Setlist />
    </div>
  );
}

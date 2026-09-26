"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, ChevronRight, Heart, LoaderCircle, MapPin, Sparkles, TrainFront } from "lucide-react";
import { GoogleG, SkylineArt, StageArt } from "@/components/brand";
import { MiniCalendar } from "@/components/MiniCalendar";
import { PlanSummaryCard } from "@/components/PlanSummary";
import { useStore } from "@/components/store";
import { formatJst } from "@/lib/time";

function EventCard() {
  const { event, eventImage } = useStore();
  return (
    <section className="card p-5" aria-labelledby="next-event">
      <div className="flex items-center justify-between">
        <h2 id="next-event" className="text-[15px] font-bold text-ink">次の推し活イベント</h2>
        <Link href="/events" className="flex items-center text-xs text-ink-soft hover:text-lav-600">
          詳細を見る <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="relative mt-3 h-36 overflow-hidden rounded-2xl sm:h-40">
        {eventImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL（メモリ上のみ）
          <img src={eventImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <StageArt className="h-full w-full" />
        )}
        <span className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-white shadow-md">
          <Heart className="h-5 w-5 fill-rose-400 text-rose-400" />
        </span>
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-wide text-ink">{event.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[15px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" strokeWidth={1.7} />
          {formatJst(event.startAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" strokeWidth={1.7} />
          {event.venue}
        </span>
      </div>
    </section>
  );
}

function CalendarCard() {
  const { session, availability, busy, extractAvailability, event } = useStore();
  const connected = session?.calendarConnected;
  return (
    <section className="card flex flex-col p-5" aria-labelledby="gcal">
      <div className="grid flex-1 gap-4 sm:grid-cols-[1fr_minmax(0,230px)]">
        <div>
          <h2 id="gcal" className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <GoogleG className="h-6 w-6" />
            Googleカレンダーと連携
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            カレンダーから予定を読み取り、推し活のための空き時間を抽出します。
          </p>
          <p className="mt-2 text-[11px] text-mute">
            {connected ? "● 連携済み（予定の中身は取得しません）" : session?.googleOAuthConfigured ? (
              <a href="/api/auth/google" className="font-semibold text-lav-600 underline-offset-2 hover:underline">
                Google アカウントを連携する →
              </a>
            ) : (
              "未連携：デモカレンダーで体験できます"
            )}
          </p>
          {availability && (
            <p className="mt-3 rounded-xl bg-lav-50 px-3 py-2 text-xs text-ink-soft">
              {availability.source === "demo" ? "デモ" : "Google"}カレンダーから
              <b className="mx-1 text-lav-700">{availability.freeSlots.length}</b>件の空き時間を抽出（予定 {availability.busyCount} 件はマスク済み）
            </p>
          )}
        </div>
        <MiniCalendar availability={availability} eventDate={event.startAt} />
      </div>
      <button
        onClick={() => void extractAvailability()}
        disabled={busy !== null}
        className="btn-primary mt-5 flex w-full items-center justify-center gap-3 rounded-xl py-3.5 text-[15px] font-bold text-white"
      >
        {busy === "availability" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" strokeWidth={1.7} />}
        空き時間を抽出
        <ChevronRight className="ml-auto mr-2 h-4 w-4" />
      </button>
    </section>
  );
}

function NextSteps() {
  const { availability, envelope, busy, generatePlan } = useStore();
  const router = useRouter();
  const steps = [
    { n: "01", icon: CalendarPlus, t: "空き時間を確認", d: "カレンダーから\n空き時間を抽出", done: Boolean(availability), tone: "from-lav-50 to-white" },
    { n: "02", icon: Sparkles, t: "美容プランを作成", d: "美容・施術の候補を\n提案します", done: Boolean(envelope), tone: "from-rose-50 to-white" },
    { n: "03", icon: TrainFront, t: "移動プランを作成", d: "出発時間・ルートを\n最適化します", done: Boolean(envelope), tone: "from-rose-50 to-white" },
  ];
  const onStep = async (i: number) => {
    if (i === 0) return document.getElementById("gcal")?.scrollIntoView({ behavior: "smooth" });
    if (envelope) return router.push("/plan");
    if (await generatePlan()) router.push("/plan");
  };
  return (
    <section className="card p-5" aria-labelledby="next-steps">
      <h2 id="next-steps" className="text-[15px] font-bold text-ink">次にやること</h2>
      <p className="mt-1 text-xs text-mute">3ステップで、推しに会う準備をはじめましょう。</p>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        {steps.map((s, i) => (
          <button
            key={s.n}
            onClick={() => void onStep(i)}
            disabled={busy !== null}
            className={`group relative flex flex-col items-center rounded-2xl border border-line bg-gradient-to-b ${s.tone} px-2 pb-4 pt-3 text-center transition hover:-translate-y-0.5 hover:shadow-md sm:items-start sm:px-4 sm:text-left`}
          >
            <span className="hidden rounded-md bg-white px-1.5 text-[11px] font-bold text-rose-500 shadow-sm sm:block">{s.n}</span>
            <span className="mt-1 grid h-12 w-12 place-items-center self-center rounded-full bg-white text-lav-600 shadow-sm sm:mt-2 sm:h-14 sm:w-14">
              {busy === "planning" && i > 0 ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <s.icon className="h-6 w-6" strokeWidth={1.6} />}
            </span>
            <span className="mt-3 text-[12px] font-bold leading-snug text-ink sm:text-[15px]">{s.t}</span>
            <span className="mt-1 hidden whitespace-pre-line text-xs leading-relaxed text-mute sm:block">{s.d}</span>
            {s.done && <span className="absolute right-2 top-2 rounded-full bg-lav-100 px-1.5 text-[10px] font-bold text-lav-600">済</span>}
            <ChevronRight className="absolute bottom-3 right-3 hidden h-4 w-4 text-mute sm:block" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-sm text-ink-soft">おかえりなさい、</p>
        <h1 className="mt-1 text-lg font-bold tracking-wide text-ink sm:text-xl">推しに会う日を、いちばん気持ちよく迎える準備をしましょう。</h1>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.02fr_1fr]">
        <EventCard />
        <CalendarCard />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <NextSteps />
        <PlanSummaryCard />
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-50 via-lav-50 to-lav-100">
        <SkylineArt className="absolute inset-y-0 right-0 h-full w-full opacity-80" />
        <div className="relative flex items-center gap-4 px-6 py-6 sm:px-10">
          <p className="text-[15px] font-medium leading-relaxed tracking-[0.08em] text-ink sm:text-xl sm:tracking-[0.12em]">
            推しに会うすべての準備を、
            <br />
            <span className="whitespace-nowrap">
              <span className="font-display text-xl italic sm:text-2xl">OshiReady</span> といっしょに。
            </span>
          </p>
          <Heart className="h-8 w-8 shrink-0 text-lav-400" strokeWidth={1.2} />
        </div>
      </section>
    </div>
  );
}

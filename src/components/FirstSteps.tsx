"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarHeart, Check, ChevronRight, LoaderCircle, Sparkles, Stamp } from "lucide-react";
import { DemoCalendarButton, useCalendarLinks } from "./CalendarConnect";
import { useStore } from "./store";

const ACTION = "flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-3.5 text-xs font-bold";

/**
 * ホームの「次にやること」。はじめて開いた人（審査員を含む）の道しるべも兼ねる。
 * ライブ登録 → AI にプランを作ってもらう → 確認して承認、の 3 ステップに完了の印を付け、次にやることのボタンだけを出す。
 */
export function NextSteps({ className = "" }: { className?: string }) {
  const { events, event, envelope, busy, generatePlan } = useStore();
  const { demoAvailable, demoConnected } = useCalendarLinks();
  const router = useRouter();

  const decided = envelope?.status === "approved" || envelope?.status === "booked";
  const planning = busy === "planning";
  // 先にプラン画面へ移り、作成の進み具合をそこで見せる（押したのに画面が止まって見えないように）
  const openPlan = () => {
    router.push("/plan");
    if (event && !envelope && busy === null) void generatePlan();
  };

  const steps = [
    {
      icon: CalendarHeart,
      title: "ライブを登録する",
      desc: demoAvailable ? "デモのカレンダーから読み込めます（ログイン不要）" : "手入力か、チケットのスクショから",
      done: events.length > 0,
      action:
        demoAvailable && !demoConnected ? (
          <DemoCalendarButton className={`btn-primary text-white ${ACTION}`} label="デモで試す" />
        ) : (
          <Link href="/events" className={`btn-primary text-white ${ACTION}`}>
            登録する <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ),
    },
    {
      icon: Sparkles,
      title: "AI にプランを作ってもらう",
      desc: "空き時間・美容・混雑・天気を AI が調べます",
      done: Boolean(envelope),
      action: (
        <button type="button" onClick={openPlan} disabled={planning} className={`btn-primary text-white ${ACTION}`}>
          {planning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
          {planning ? "作成中" : "作る"}
          {!planning && <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ),
    },
    {
      icon: Stamp,
      title: "確認して承認する",
      desc: "押したものだけ予約します（デモ予約）",
      done: decided,
      action: (
        <Link href="/plan" className={`btn-primary text-white ${ACTION}`}>
          確認する <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className={`card flex min-h-0 flex-col p-5 ${className}`} aria-labelledby="next-steps">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-mute">Tonight&apos;s Setlist</p>
          <h2 id="next-steps" className="text-[17px] font-bold text-ink">
            次にやること
          </h2>
        </div>
        <p className="font-display text-2xl font-semibold leading-none text-ink">
          {doneCount}
          <span className="text-sm italic text-mute"> / 3</span>
        </p>
      </div>
      <div className="mt-3 h-1 shrink-0 overflow-hidden rounded-full bg-lav-50">
        <div className="h-full rounded-full bg-gradient-to-r from-lav-400 to-rose-400 transition-all duration-1000" style={{ width: `${(doneCount / 3) * 100}%` }} />
      </div>
      <ol className="mt-1 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 py-2" aria-current={i === next ? "step" : undefined}>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${s.done ? "bg-rose-400 text-white" : i === next ? "bg-night text-white" : "bg-lav-50 text-lav-600"}`}
            >
              {s.done ? <Check className="h-4 w-4" strokeWidth={2.4} /> : <s.icon className="h-4 w-4" strokeWidth={1.8} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-bold ${s.done ? "text-ink-soft" : "text-ink"}`}>{s.title}</span>
              <span className="block truncate text-[11px] text-mute" title={s.desc}>
                {s.desc}
              </span>
            </span>
            {i === next ? s.action : <span className="shrink-0 text-[10px] font-bold tracking-[0.2em] text-mute">{s.done ? "DONE" : `M${i + 1}`}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

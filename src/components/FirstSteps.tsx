"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, ShieldCheck, X } from "lucide-react";
import { DemoCalendarButton, useCalendarLinks } from "./CalendarConnect";
import { useStore } from "./store";

const HIDDEN_KEY = "oshiready.firstSteps";

/**
 * はじめて開いた人（審査員を含む）向けの 3 ステップの案内。
 * 進み具合に合わせて完了の印を付け、次にやることのボタンだけを出す。閉じるとこの端末では以後表示しない。
 */
export function FirstSteps() {
  const { events, envelope } = useStore();
  const { demoAvailable, demoConnected } = useCalendarLinks();
  // 初回の描画ではサーバーと同じく何も出さず、端末の記録を読んでから決める
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setHidden(localStorage.getItem(HIDDEN_KEY) === "hidden");
      } catch {
        setHidden(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (hidden !== false) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, "hidden");
    } catch {
      /* 保存できない環境では、この画面を開いている間だけ閉じる */
    }
  };

  const hasEvent = events.length > 0;
  const hasPlan = Boolean(envelope);
  const decided = envelope?.status === "approved" || envelope?.status === "booked";
  const steps = [
    {
      title: "ライブを登録する",
      desc: demoAvailable ? "デモのカレンダーから、架空のライブを読み込みます（ログイン不要）" : "公演名・日時・会場を入れるか、チケットのスクショから読み取ります",
      done: hasEvent,
      action: demoAvailable && !demoConnected ? (
        <DemoCalendarButton className="btn-primary min-h-[40px] rounded-xl px-3 text-xs font-bold text-white" />
      ) : (
        <Link href="/events" className="flex min-h-[40px] items-center gap-1 rounded-xl border border-line bg-white px-3 text-xs font-bold text-ink hover:bg-lav-50">
          ライブを登録 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
    {
      title: "AI にプランを作ってもらう",
      desc: "空き時間・美容のタイミング・混雑・天気を AI が調べ、検証で差し戻されたら自分で直します",
      done: hasPlan,
      action: (
        <Link href="/plan" className="flex min-h-[40px] items-center gap-1 rounded-xl border border-line bg-white px-3 text-xs font-bold text-ink hover:bg-lav-50">
          プランへ <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
    {
      title: "確認して承認する",
      desc: "承認して「予約する」を押したものだけ予約します（デモ予約：実在の店舗には届きません）",
      done: decided,
      action: (
        <Link href="/plan" className="flex min-h-[40px] items-center gap-1 rounded-xl border border-line bg-white px-3 text-xs font-bold text-ink hover:bg-lav-50">
          承認へ <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="card relative p-5" aria-labelledby="first-steps">
      <button onClick={close} aria-label="案内を閉じる" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-lav-50">
        <X className="h-4 w-4" />
      </button>
      <p className="text-[11px] font-bold tracking-[0.25em] text-mute">GETTING STARTED</p>
      <h2 id="first-steps" className="mt-1 text-[15px] font-bold text-ink">
        はじめての方へ：3 ステップで試せます
      </h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`flex flex-col gap-2 rounded-2xl border p-4 ${i === next ? "border-rose-200 bg-rose-50/60" : "border-line bg-white"}`}
            aria-current={i === next ? "step" : undefined}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${s.done ? "bg-lav-600 text-white" : "bg-lav-100 text-lav-700"}`}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s.title}
            </p>
            <p className="text-xs leading-relaxed text-ink-soft">{s.desc}</p>
            {i === next && <div className="mt-auto pt-1">{s.action}</div>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] leading-relaxed text-mute">
        <ShieldCheck className="mr-1 inline-block h-3.5 w-3.5 align-[-2px] text-lav-600" />
        AI ができること・できないことは
        <Link href="/settings" className="mx-0.5 font-bold text-lav-700 underline-offset-2 hover:underline">
          設定
        </Link>
        で確認できます。支払いは発生しません。
      </p>
    </section>
  );
}

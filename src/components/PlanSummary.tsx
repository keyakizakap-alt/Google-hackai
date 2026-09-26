"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { relativeDayLabel, formatJst } from "@/lib/time";
import { ItemIcon } from "./icons";
import { useStore } from "./store";

export const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  generating: "作成中",
  pending_approval: "承認待ち",
  revising: "修正中",
  approved: "承認済み",
  rejected: "見送り",
  booking: "予約処理中",
  booked: "予約完了",
};

/** ホームの「提案プラン（概要）」カード */
export function PlanSummaryCard() {
  const { envelope, busy } = useStore();
  const plan = envelope?.plan;
  const items = plan?.items.filter((i) => i.kind === "beauty" || i.kind === "transit").slice(0, 4) ?? [];

  return (
    <section className="card flex flex-col p-5" aria-labelledby="plan-summary">
      <div className="flex items-center justify-between">
        <h2 id="plan-summary" className="text-[15px] font-bold text-ink">提案プラン（概要）</h2>
        <span className="rounded-full bg-lav-50 px-2.5 py-1 text-[11px] font-semibold text-lav-600">
          {envelope ? `AIが作成・${STATUS_LABEL[envelope.status]}` : "AIが作成"}
        </span>
      </div>

      {busy === "planning" ? (
        <div className="mt-5 space-y-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-11 rounded-xl" />
          ))}
          <p className="text-center text-xs text-mute">エージェントがカレンダー・サロン・経路を確認しています…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl bg-lav-50/60 px-4 py-8 text-center">
          <p className="text-sm text-ink-soft">まだプランはありません。</p>
          <p className="mt-1 text-xs text-mute">「空き時間を抽出」してからプランを作成しましょう。</p>
        </div>
      ) : (
        <ol className="relative mt-5 space-y-4 pl-1">
          <span className="absolute bottom-3 left-[98px] top-3 w-px bg-rose-100" aria-hidden />
          {items.map((it) => {
            return (
              <li key={it.id} className="relative flex items-center gap-3">
                <div className="w-[76px] shrink-0">
                  <p className="text-sm font-bold text-ink">{relativeDayLabel(it.start, plan!.event.startAt)}</p>
                  <p className="text-[11px] text-mute">{formatJst(it.start, { date: true })}</p>
                </div>
                <span className="relative z-10 h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-rose-300 bg-white" />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">
                  <ItemIcon item={it} />
                </span>
                <p className="truncate text-sm font-bold text-ink">{it.title}</p>
              </li>
            );
          })}
        </ol>
      )}

      <Link href="/plan" className="btn-primary mt-auto flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white max-lg:mt-6 lg:mt-6">
        プランを見る
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

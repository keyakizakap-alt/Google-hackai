"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { relativeDayLabel, formatJst } from "@/lib/time";
import { AgentConsole } from "./AgentConsole";
import { ItemIcon } from "./icons";
import { useStore } from "./store";

export const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  generating: "作成中",
  pending_approval: "あなたの確認待ち",
  revising: "作り直し中",
  approved: "承認済み",
  rejected: "見送り",
  booking: "手続き準備中",
  booked: "予約手続きへ",
};

/** ホームの「提案プラン（概要）」カード */
export function PlanSummaryCard() {
  const { envelope, busy } = useStore();
  const plan = envelope?.plan;
  const items = plan?.items.filter((i) => i.kind === "beauty" || i.kind === "transit").slice(0, 4) ?? [];

  return (
    <section className="card card-lift flex flex-col p-6" aria-labelledby="plan-summary">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-sm italic text-mute">Countdown Plan</p>
          <h2 id="plan-summary" className="text-[17px] font-bold text-ink">提案プラン</h2>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-500">
          {envelope ? `AI作成・${STATUS_LABEL[envelope.status]}` : "AIが作成"}
        </span>
      </div>

      {busy === "planning" ? (
        <div className="mt-5">
          <AgentConsole running compact />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-lav-200 px-4 py-10 text-center">
          <p className="font-display text-4xl italic text-lav-200">No plan yet</p>
          <p className="mt-2 text-xs text-mute">「次にやること」の M2 からプランを作れます。</p>
        </div>
      ) : (
        <ol key={`${plan!.id}-${plan!.revision}`} className="relative mt-6 space-y-5">
          <span className="draw-line absolute bottom-2 left-[83px] top-2 w-[2px] rounded bg-gradient-to-b from-rose-300 to-lav-200" aria-hidden />
          {items.map((it, idx) => (
            <li key={it.id} className="pop-in relative flex items-center gap-3" style={{ "--delay": `${300 + idx * 140}ms` } as React.CSSProperties}>
              <div className="w-[68px] shrink-0 text-right">
                <p className="font-display text-xl font-semibold leading-none text-ink">{relativeDayLabel(it.start, plan!.event.startAt)}</p>
                <p className="mt-1 text-[11px] text-mute">{formatJst(it.start, { date: true })}</p>
              </div>
              <span className="relative z-10 h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-rose-400 bg-white shadow-[0_0_0_4px_var(--oshi-50)]" />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">
                <ItemIcon item={it} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{it.title}</p>
                <p className="truncate text-[11px] text-mute">{formatJst(it.start, { time: true })}〜 {it.provider?.name ?? it.route?.to ?? ""}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Link href="/plan" className="btn-primary mt-6 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold">
        プランを見る
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

"use client";

import Link from "next/link";
import { CalendarClock, GitCompareArrows, LoaderCircle, Sparkles } from "lucide-react";
import type { Decision } from "@/lib/agent/types";
import { formatJst } from "@/lib/time";
import { useStore } from "./store";

/**
 * エージェントの判断の根拠。何と何を比べて、なぜそれを選んだかを見せる。
 * 中身はエージェント（またはかんたんモード）が submit_timeline で提出した記録そのもの。
 */
export function DecisionsCard({ decisions, agentic }: { decisions?: Decision[]; agentic: boolean }) {
  if (!decisions || decisions.length === 0) return null;
  return (
    <section className="card p-5" aria-labelledby="decisions">
      <h2 id="decisions" className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <GitCompareArrows className="h-5 w-5 text-lav-600" />
        {agentic ? "エージェントの判断" : "判断の根拠"}
      </h2>
      <p className="mt-1 text-xs text-mute">比べた候補と、選んだ理由です。気になるところは「AIに相談して直す」から伝えられます。</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {decisions.map((d, i) => (
          <li key={i} className="pop-in rounded-2xl border border-line bg-white p-4" style={{ "--delay": `${i * 90}ms` } as React.CSSProperties}>
            <p className="text-[11px] font-bold tracking-wide text-mute">{d.topic}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[15px] font-bold text-ink">
              <Sparkles className="h-4 w-4 shrink-0 text-rose-400" />
              {d.chosen}
            </p>
            {d.alternatives.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-mute">
                比べた候補：
                {d.alternatives.map((a) => (
                  <span key={a} className="rounded-full bg-cloud px-2 py-0.5 line-through decoration-lav-200">
                    {a}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{d.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * カレンダーに後から入った予定とプラン・予約が重なったときの知らせ。
 * エージェントが自分から気づいて見直しを提案する（実行するのはユーザーがボタンを押したときだけ）。
 */
export function ConflictBanner() {
  const { conflicts, replanForConflicts, busy, aiReady } = useStore();
  if (conflicts.length === 0) return null;
  const reserved = conflicts.filter((c) => c.source === "reservation");
  const working = busy === "revising" || busy === "planning";
  return (
    <section role="alert" className="pop-in flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-rose-500">
        <CalendarClock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">カレンダーに新しい予定が入り、{conflicts.length} 件が重なっています</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {conflicts.map((c) => `${c.title}（${formatJst(c.start)}）`).join("、")}
          {reserved.length > 0 && " ／ 予約済みのものは、予約の管理でキャンセルしてから組み直してください。"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {reserved.length > 0 && (
          <Link href="/bookings" className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-xs font-bold text-ink hover:bg-lav-50">
            予約の管理
          </Link>
        )}
        <button
          onClick={() => void replanForConflicts()}
          disabled={busy !== null}
          className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-white"
        >
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiReady ? "エージェントに組み直してもらう" : "重ならないように組み直す"}
        </button>
      </div>
    </section>
  );
}

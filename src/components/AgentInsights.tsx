"use client";

import Link from "next/link";
import { CalendarClock, CloudRain, GitCompareArrows, LoaderCircle, Radar, Sparkles } from "lucide-react";
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
        {agentic ? "こう選んだ理由" : "選んだ理由"}
      </h2>
      <p className="mt-1 text-xs text-mute">比べた候補と決め手です。気になるところは「AIに相談して直す」からどうぞ。</p>
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
                ほかの候補
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
  const { conflicts: all, replanForConflicts, busy, aiReady, watch } = useStore();
  // プランの重なりは見張りのカードで扱うので、そちらに出ているときは予約の重なりだけを出す
  const conflicts = watch.signals.some((s) => s.kind === "conflict") ? all.filter((c) => c.source === "reservation") : all;
  if (conflicts.length === 0) return null;
  const reserved = conflicts.filter((c) => c.source === "reservation");
  const working = busy === "revising" || busy === "planning";
  return (
    <section role="alert" className="pop-in flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-rose-500">
        <CalendarClock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">カレンダーの新しい予定と、{conflicts.length} 件が重なりました</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
          {conflicts.map((c) => `${c.title}（${formatJst(c.start)}）`).join("、")}
          {reserved.length > 0 && "。予約したものは、予約の管理でキャンセルしてから組み直しましょう。"}
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
          {aiReady ? "おまかせで組み直す" : "重ならないように組み直す"}
        </button>
      </div>
    </section>
  );
}

/**
 * カレンダー側でライブの日時が変わったが、承認・予約済みのプランがあるため自動では作り直していないもの。
 * 作り直すかどうかは利用者が決める（新しいプランも承認待ちで止まり、今のプランや予約は勝手に変えない）。
 */
export function CalendarChangeBanner() {
  const { calendarChanges, replanForCalendarChange, dismissCalendarChange, busy } = useStore();
  if (calendarChanges.length === 0) return null;
  return (
    <div className="space-y-3">
      {calendarChanges.map((c) => (
        <section key={c.eventId} role="alert" className="pop-in flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-amber-600">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">カレンダーで「{c.title}」の日時が変わりました</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {formatJst(c.before)} → <b className="text-ink">{formatJst(c.after)}</b>
              。承認したプランは前の日時のままです。予約したものがあれば、予約の管理で確かめてください。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => dismissCalendarChange(c.eventId)} className="min-h-[44px] rounded-xl border border-line bg-white px-4 text-xs text-ink-soft hover:bg-lav-50">
              あとで
            </button>
            <button
              type="button"
              onClick={() => replanForCalendarChange(c.eventId)}
              disabled={busy !== null}
              className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-white"
            >
              {busy === "planning" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              新しい日時で作り直す
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * 見張り: 承認したあとに起きた変化（カレンダーの重なり・公演日の雨）と、AI が作った見直し案。
 * 見直し案は承認待ちの新しいプランで、切り替えるかどうかは利用者が決める。今のプランや予約は勝手に変えない。
 */
export function WatchCard() {
  const { watch, autoReview, aiReady, requestReview, adoptProposal, dismissProposal, busy } = useStore();
  const { signals, proposal, reviewing, error } = watch;
  if (signals.length === 0 && !proposal && !reviewing) return null;
  return (
    <section className="pop-in overflow-hidden rounded-2xl border border-lav-200 bg-white shadow-float" aria-labelledby="watch-title" role="status">
      <div className="flex items-center gap-3 bg-night px-4 py-3 text-white">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
          <Radar className="h-5 w-5 text-rose-300" />
        </span>
        <div className="min-w-0">
          <p id="watch-title" className="text-sm font-bold">プランに関わる変化がありました</p>
          <p className="text-[11px] text-white/60">開いたときと 10 分ごとに、カレンダーと公演日の天気（気象庁）を見ています</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <ul className="space-y-2">
          {signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              {s.kind === "conflict" ? <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-lav-600" />}
              <span>
                {s.kind === "conflict"
                  ? `カレンダーの新しい予定が、${s.titles.join("、")} と重なりました`
                  : `公演日 ${s.date.slice(5).replace("-", "/")} は「${s.text || (s.sky === "snow" ? "雪" : "雨")}」の予報です。プランに雨や雪への備えがまだ入っていません`}
              </span>
            </li>
          ))}
        </ul>

        {reviewing && (
          <p className="flex items-center gap-2 rounded-xl bg-lav-50 px-3 py-2 text-xs text-ink-soft">
            <LoaderCircle className="h-4 w-4 animate-spin text-lav-600" />
            見直し案を作っています。今のプランはそのままです
          </p>
        )}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}

        {proposal ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-rose-400" />
              見直し案ができました（改訂 {proposal.envelope.plan.revision}）
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{proposal.envelope.plan.summary}</p>
            <p className="mt-2 text-[11px] text-mute">切り替えたら、もう一度あなたの承認が必要です。予約したものはそのまま残り、勝手に予約やキャンセルをすることはありません。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={adoptProposal} disabled={busy !== null} className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-white">
                見直し案に切り替える
              </button>
              <button onClick={dismissProposal} className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-xs font-bold text-ink hover:bg-lav-50">
                今のままにする
              </button>
            </div>
          </div>
        ) : (
          !reviewing &&
          aiReady &&
          !autoReview && (
            <button
              onClick={() => void requestReview()}
              disabled={busy !== null}
              className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-white"
            >
              <Sparkles className="h-4 w-4" />
              見直し案を作る
            </button>
          )
        )}
      </div>
    </section>
  );
}

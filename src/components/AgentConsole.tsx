"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { TraceStep } from "@/lib/agent/types";

const THINKING = [
  ["get_free_time_slots", "カレンダーの空き時間を確認しています"],
  ["get_beauty_guideline", "美容メニューの最適なタイミングを調べています"],
  ["search_beauty_salons", "空き時間に入るサロンの枠を探しています"],
  ["estimate_crowd", "会場周辺の混雑を予測しています"],
  ["search_transit_route", "混雑を避けた経路を探索しています"],
  ["submit_timeline", "タイムラインを検証しています"],
] as const;

/**
 * エージェントの「思考ログ」をターミナル風に表示する。
 * running 中は実行順の目安を流し、完了後は実際のトレースを 1 行ずつ再生する（可観測性の可視化）。
 */
export function AgentConsole({ running, trace = [], compact = false }: { running: boolean; trace?: TraceStep[]; compact?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, [running]);

  const lines = running
    ? THINKING.slice(0, Math.min(THINKING.length, (tick % (THINKING.length + 2)) + 1)).map(([name, text], i, arr) => ({
        key: name,
        name,
        text,
        state: i === arr.length - 1 ? ("run" as const) : ("ok" as const),
        ms: undefined as number | undefined,
      }))
    : trace.map((t) => ({ key: `${t.step}`, name: t.name, text: t.summary, state: t.ok ? ("ok" as const) : ("ng" as const), ms: t.latencyMs }));

  return (
    <div className="overflow-hidden rounded-2xl bg-night text-[12px] text-white/80 shadow-float" role="log" aria-live="polite" aria-label="エージェントの行動ログ">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="ml-3 font-mono text-[11px] tracking-wider text-white/50">oshiready-agent {running ? "— planning" : `— ${trace.length} steps`}</span>
        {running && <span className="pulse-ring relative ml-auto h-2 w-2 rounded-full bg-rose-400" />}
      </div>
      <ol className={`space-y-1.5 px-4 py-3 font-mono ${compact ? "max-h-44" : "max-h-80"} overflow-y-auto`}>
        {lines.map((l, i) => (
          <li key={l.key + i} className="pop-in flex items-start gap-2" style={{ "--delay": running ? "0ms" : `${i * 110}ms` } as React.CSSProperties}>
            {l.state === "run" ? (
              <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
            ) : l.state === "ok" ? (
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            ) : (
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
            )}
            <span className="shrink-0 text-rose-300">{l.name}</span>
            <span className={`min-w-0 text-white/65 ${l.state === "run" ? "caret" : ""}`}>{l.text}</span>
            {l.ms !== undefined && <span className="ml-auto shrink-0 text-white/35">{l.ms}ms</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

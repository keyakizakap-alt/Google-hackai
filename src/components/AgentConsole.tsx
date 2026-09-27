"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { TraceStep } from "@/lib/agent/types";

const THINKING = [
  ["空き時間", "カレンダーの空き時間を確認しています"],
  ["美容の目安", "美容メニューのベストなタイミングを調べています"],
  ["サロン", "空き時間に行けるサロンを探しています"],
  ["混雑", "会場まわりの混み具合を予想しています"],
  ["移動", "混雑を避けたルートを探しています"],
  ["最終チェック", "予定どうしが重ならないか確認しています"],
] as const;

/** 内部の処理名を、ユーザー向けの短いラベルに言い換える */
export function friendlyStep(name: string): string {
  if (name.startsWith("ekispert_")) return "乗換案内";
  const map: Record<string, string> = {
    get_free_time_slots: "空き時間",
    get_beauty_guideline: "美容の目安",
    search_beauty_salons: "サロン",
    get_skin_analysis: "肌診断",
    estimate_crowd: "混雑",
    search_transit_route_mock: "移動",
    submit_timeline: "最終チェック",
    plan: "準備",
    fallback: "切り替え",
  };
  return map[name] ?? "安全確認";
}

/**
 * AI が何を調べたかをターミナル風に表示する（可観測性の可視化）。
 * running 中は実行順の目安を流し、完了後は実際の記録を 1 行ずつ再生する。内部の処理名はユーザー向けの言葉に置き換える。
 */
export function AgentConsole({ running, trace = [], compact = false, label, agentic = true }: { running: boolean; trace?: TraceStep[]; compact?: boolean; label?: string; agentic?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, [running]);

  const lines = running
    ? // 実行中は目安の手順を順に表示し、最後の手順で止めて待つ（最初に戻って繰り返すと「やり直している」ように見えるため）
      THINKING.slice(0, Math.min(THINKING.length, tick + 1)).map(([name, text], i, arr) => ({
        key: name,
        name,
        text,
        state: i === arr.length - 1 ? ("run" as const) : ("ok" as const),
        ms: undefined as number | undefined,
      }))
    : trace.map((t) => ({ key: `${t.step}`, name: friendlyStep(t.name), text: t.summary, state: t.ok ? ("ok" as const) : ("ng" as const), ms: undefined as number | undefined }));

  return (
    <div className="overflow-hidden rounded-2xl bg-night text-[12px] text-white/80 shadow-float" role="log" aria-live="polite" aria-label="AIが調べたこと">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="ml-3 text-[11px] tracking-wider text-white/55">{running ? (label ?? "AI エージェントが調べながら考えています…") : `${agentic ? "AI エージェントが調べたこと" : "確認したこと"}（${trace.length}件）`}</span>
        {running && <span className="pulse-ring relative ml-auto h-2 w-2 rounded-full bg-rose-400" />}
      </div>
      <ol className={`space-y-1.5 px-4 py-3 ${compact ? "max-h-44" : "max-h-80"} overflow-y-auto`}>
        {lines.map((l, i) => (
          <li key={l.key + i} className="pop-in flex items-start gap-2" style={{ "--delay": running ? "0ms" : `${i * 110}ms` } as React.CSSProperties}>
            {l.state === "run" ? (
              <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
            ) : l.state === "ok" ? (
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            ) : (
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
            )}
            <span className="w-20 shrink-0 font-bold text-rose-300">{l.name}</span>
            <span className={`min-w-0 text-white/65 ${l.state === "run" ? "caret" : ""}`}>{l.text}</span>
            {l.ms !== undefined && <span className="ml-auto shrink-0 text-white/35">{l.ms}ms</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

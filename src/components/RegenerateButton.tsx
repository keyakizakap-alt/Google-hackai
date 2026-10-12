"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useStore } from "./store";

/**
 * 「最初から作り直す」ボタン（ホームとプラン画面で共通）。
 * - プランがまだ無ければ作る。承認待ちのプランはそのまま新しいプランに置き換える
 * - 承認・予約済みのプランは確認してから置き換える（新しいプランも承認待ちで止まる。
 *   予約は取り消さず、承認済みのプランは見張りの対象として残る）
 */
export function RegenerateButton({ variant = "outline", className = "" }: { variant?: "outline" | "light"; className?: string }) {
  const { envelope, event, busy, generatePlan, aiReady } = useStore();
  if (!event) return null;
  const planning = busy === "planning";
  const forThisEvent = envelope?.plan.event.id === event.id;
  const decided = forThisEvent && (envelope?.status === "approved" || envelope?.status === "booked");
  const label = planning ? "作り直しています…" : aiReady ? "AI に最初から作り直してもらう" : "最初から作り直す";
  const onClick = () => {
    if (decided && !window.confirm("承認済みのプランを、新しく作るプラン（承認待ち）に置き換えます。予約はそのまま残ります。よろしいですか？")) return;
    void generatePlan(event);
  };
  const styles =
    variant === "light"
      ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
      : "border-rose-200 bg-white text-rose-600 hover:bg-rose-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition disabled:opacity-50 ${styles} ${className}`}
    >
      {planning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {label}
    </button>
  );
}

import type { Actor, HistoryEntry, PlanStatus } from "./types";

/**
 * Human-in-the-loop ガードレール。
 *
 * - 予約（booking）に到達できるのは approved からのみ。
 * - approved に到達できるのは pending_approval からのみ。
 *   → エージェントが生成したプランは必ず pending_approval を経由する。
 * - approved / rejected / booking への遷移はユーザー（actor = "user"）しか実行できない。
 *   エージェントには予約系のツールを一切渡していないため、二重の制御になる。
 */
export const TRANSITIONS: Readonly<Record<PlanStatus, readonly PlanStatus[]>> = {
  draft: ["generating"],
  generating: ["pending_approval", "draft"],
  pending_approval: ["revising", "approved", "rejected"],
  revising: ["pending_approval"],
  approved: ["booking", "revising"],
  rejected: ["revising"],
  booking: ["booked", "approved"],
  booked: [],
};

const USER_ONLY: ReadonlySet<PlanStatus> = new Set(["approved", "rejected", "booking"]);

export class GuardrailError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_TRANSITION" | "USER_ACTION_REQUIRED" | "SIGNATURE_INVALID" | "EXPIRED",
  ) {
    super(message);
    this.name = "GuardrailError";
  }
}

export function canTransition(from: PlanStatus, to: PlanStatus, actor: Actor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (USER_ONLY.has(to) && actor !== "user") return false;
  return true;
}

export function assertTransition(from: PlanStatus, to: PlanStatus, actor: Actor): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new GuardrailError("この操作は今は実行できません。画面を更新してやり直してください", "INVALID_TRANSITION");
  }
  if (USER_ONLY.has(to) && actor !== "user") {
    throw new GuardrailError("この操作にはあなたの確認が必要です", "USER_ACTION_REQUIRED");
  }
}

/** 遷移を検証しつつ履歴を追記した新しい配列を返す（イミュータブル） */
export function advance(
  history: readonly HistoryEntry[],
  from: PlanStatus,
  to: PlanStatus,
  actor: Actor,
  now = new Date(),
): HistoryEntry[] {
  assertTransition(from, to, actor);
  return [...history, { status: to, at: now.toISOString(), actor }].slice(-60);
}

/** 履歴に pending_approval → approved（ユーザー操作）が含まれるかを検査する */
export function hasUserApproval(history: readonly HistoryEntry[]): boolean {
  for (let i = 1; i < history.length; i++) {
    if (history[i].status === "approved" && history[i].actor === "user" && history[i - 1].status === "pending_approval") {
      return true;
    }
  }
  return false;
}

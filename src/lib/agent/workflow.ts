import "server-only";
import { CalendarAuthError } from "../google/calendar";
import { logger } from "../logger";
import { collectBusy } from "../sources";
import { redactText } from "../privacy/mask";
import { MS_DAY } from "../time";
import { withoutEventBlock } from "./conflicts";
import { signEnvelope } from "./envelope";
import { runPlanningAgent } from "./orchestrator";
import { advance } from "./stateMachine";
import type { HistoryEntry, OshiEvent, Plan, PlanEnvelope, PlanStatus } from "./types";

/**
 * 「生成 → 承認待ち」までの一連のワークフロー。
 * どの経路でも最後は必ず pending_approval で止まり、ユーザー操作を待つ。
 */
export async function generatePlan(params: {
  event: OshiEvent;
  previous?: { plan: Plan; status: PlanStatus; history: HistoryEntry[] };
  /**
   * 見張りからの見直しのように、期限切れの封筒を「参考」として渡す場合。
   * 状態は引き継がず、新しいプランとして承認待ちまで進める（古い承認を流用しない）
   */
  basePlan?: Plan;
  instruction?: string;
  /** 誰が作成・修正を始めたか。見張りによる自動の見直しは system として履歴に残す */
  initiatedBy?: "user" | "system";
  requestId: string;
  trace?: string;
}) {
  const { event, previous } = params;
  const actor = params.initiatedBy ?? "user";

  // 1) 状態遷移: 新規は draft → generating、修正は (現在) → revising
  let history: HistoryEntry[] = previous?.history ?? [{ status: "draft", at: new Date().toISOString(), actor }];
  const from: PlanStatus = previous?.status ?? "draft";
  const working: PlanStatus = previous ? "revising" : "generating";
  history = advance(history, from, working, actor);

  // 2) カレンダー取得（メモリ上でマスク済み Busy に変換）
  // すべての連携カレンダーから「時間帯だけ」を集める（共通の安全チェックを通過済み）
  // カレンダーが一時的に読めない（混み合い・応答なし）ときも、プランは作る。重なりは確認できていないと注意書きで伝える。
  // 認証が切れたときは、再連携してもらう必要があるのでそのまま伝える
  let fetched: Awaited<ReturnType<typeof collectBusy>>;
  let calendarUnavailable = false;
  try {
    fetched = await collectBusy({ from: Date.now(), to: Math.max(Date.now() + 30 * MS_DAY, Date.parse(event.startAt) + MS_DAY) });
  } catch (e) {
    if (e instanceof CalendarAuthError) throw e;
    logger.warn("plan.calendar_unavailable", { requestId: params.requestId, errorCode: (e as Error).name });
    fetched = { source: "demo", sources: [], busy: [] };
    calendarUnavailable = true;
  }
  const { source } = fetched;
  // ライブ本体の予定（カレンダーから取り込んだイベント自身）は「埋まり」として扱わない
  const busy = withoutEventBlock(fetched.busy, event.startAt);

  // 3) エージェント実行
  const result = await runPlanningAgent({
    event,
    busy,
    calendarSource: source,
    calendarUnavailable,
    previous: previous?.plan ?? params.basePlan,
    instruction: params.instruction ? redactText(params.instruction) : undefined,
    requestId: params.requestId,
    trace: params.trace,
  });

  // 4) 必ず pending_approval へ（エージェントは approved 以降に進めない）
  history = advance(history, working, "pending_approval", "agent");
  const envelope: PlanEnvelope = signEnvelope({ plan: result.plan, status: "pending_approval", approvedItemIds: [], history });

  return { envelope, trace: result.trace, usage: result.usage, engine: result.engine, calendarSource: source };
}

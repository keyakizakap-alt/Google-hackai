import "server-only";
import { collectBusy } from "../sources";
import { redactText } from "../privacy/mask";
import { analyzeSkin } from "../services/youcam";
import { MS_DAY } from "../time";
import { signEnvelope } from "./envelope";
import { runPlanningAgent } from "./orchestrator";
import { advance } from "./stateMachine";
import type { HistoryEntry, OshiEvent, Plan, PlanEnvelope, PlanStatus } from "./types";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * 「生成 → 承認待ち」までの一連のワークフロー。
 * どの経路でも最後は必ず pending_approval で止まり、ユーザー操作を待つ。
 */
export async function generatePlan(params: {
  event: OshiEvent;
  selfieBase64?: string;
  previous?: { plan: Plan; status: PlanStatus; history: HistoryEntry[] };
  instruction?: string;
  requestId: string;
  trace?: string;
}) {
  const { event, previous } = params;

  // 1) 状態遷移: 新規は draft → generating、修正は (現在) → revising
  let history: HistoryEntry[] = previous?.history ?? [{ status: "draft", at: new Date().toISOString(), actor: "user" }];
  const from: PlanStatus = previous?.status ?? "draft";
  const working: PlanStatus = previous ? "revising" : "generating";
  history = advance(history, from, working, "user");

  // 2) カレンダー取得（メモリ上でマスク済み Busy に変換）
  // すべての連携カレンダーから「時間帯だけ」を集める（共通の安全チェックを通過済み）
  const fetched = await collectBusy({ from: Date.now(), to: Math.max(Date.now() + 30 * MS_DAY, Date.parse(event.startAt) + MS_DAY) });
  const { source } = fetched;
  // ライブ本体の予定（カレンダーから取り込んだイベント自身）は「埋まり」として扱わない
  const evStart = Date.parse(event.startAt);
  const busy = fetched.busy.filter((b) => {
    const s = Date.parse(b.start);
    const e = Date.parse(b.end);
    return !(!b.allDay && s >= evStart - 3 * 3_600_000 && s <= evStart + 3_600_000 && e >= evStart && e <= evStart + 6 * 3_600_000);
  });

  // 3) 顔画像があれば YouCam 解析（メモリ上のみ。処理後にバッファを zero-fill）
  let skin;
  if (params.selfieBase64) {
    const buf = Buffer.from(params.selfieBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("image too large");
    skin = await analyzeSkin(buf);
  }

  // 4) エージェント実行
  const result = await runPlanningAgent({
    event,
    busy,
    calendarSource: source,
    skin,
    previous: previous?.plan,
    instruction: params.instruction ? redactText(params.instruction) : undefined,
    requestId: params.requestId,
    trace: params.trace,
  });

  // 5) 必ず pending_approval へ（エージェントは approved 以降に進めない）
  history = advance(history, working, "pending_approval", "agent");
  const envelope: PlanEnvelope = signEnvelope({ plan: result.plan, status: "pending_approval", approvedItemIds: [], history });

  return { envelope, trace: result.trace, usage: result.usage, engine: result.engine, calendarSource: source };
}

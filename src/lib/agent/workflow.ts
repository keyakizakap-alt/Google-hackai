import "server-only";
import { getBusyBlocks } from "../google/calendar";
import { redactText } from "../privacy/mask";
import { analyzeSkin } from "../services/youcam";
import { jstDateKey, MS_DAY } from "../time";
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
  const { busy, source } = await getBusyBlocks({ days: 30, until: Date.parse(event.startAt) + MS_DAY, demoDayOff: jstDateKey(Date.parse(event.startAt)) });

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

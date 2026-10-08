import "server-only";
import { hmac, verifyHmac } from "../crypto";
import { GuardrailError } from "./stateMachine";
import { PlanEnvelopeSchema, PlanSchema, type PlanEnvelope } from "./types";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 時間で失効（古い提案で予約させない）

type Unsigned = Omit<PlanEnvelope, "sig" | "issuedAt" | "expiresAt">;

function canonical(env: Omit<PlanEnvelope, "sig">): string {
  return JSON.stringify({
    plan: env.plan,
    status: env.status,
    approvedItemIds: env.approvedItemIds,
    history: env.history,
    issuedAt: env.issuedAt,
    expiresAt: env.expiresAt,
  });
}

export function signEnvelope(env: Unsigned, now = Date.now()): PlanEnvelope {
  // 検証側（スキーマで読み直した形）と同じ項目の並び・既定値にそろえてから署名する
  const body = { ...env, plan: PlanSchema.parse(env.plan), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() };
  return { ...body, sig: hmac(canonical(body), "plan") };
}

/**
 * クライアントから戻ってきた封筒を検証する。改ざん・期限切れは GuardrailError。
 * allowExpired は「中身を参照するだけ」の用途（見張り）に限る。承認・予約など状態を進める処理では使わない。
 */
export function verifyEnvelope(input: unknown, now = Date.now(), opts: { allowExpired?: boolean } = {}): PlanEnvelope {
  const parsed = PlanEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw new GuardrailError("プランを読み込めませんでした。もう一度作成してください", "SIGNATURE_INVALID");
  const env = parsed.data;
  const { sig, ...rest } = env;
  if (!verifyHmac(canonical(rest), sig, "plan")) {
    throw new GuardrailError("プランの内容を確認できませんでした。もう一度作成してください", "SIGNATURE_INVALID");
  }
  if (!opts.allowExpired && Date.parse(env.expiresAt) < now) {
    throw new GuardrailError("プランの有効期限（2時間）が切れました。もう一度作成してください", "EXPIRED");
  }
  return env;
}

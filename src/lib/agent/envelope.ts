import "server-only";
import { hmac, verifyHmac } from "../crypto";
import { GuardrailError } from "./stateMachine";
import { PlanEnvelopeSchema, type PlanEnvelope } from "./types";

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
  const body = { ...env, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() };
  return { ...body, sig: hmac(canonical(body), "plan") };
}

/** クライアントから戻ってきた封筒を検証する。改ざん・期限切れは GuardrailError */
export function verifyEnvelope(input: unknown, now = Date.now()): PlanEnvelope {
  const parsed = PlanEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw new GuardrailError("プランの形式が不正です", "SIGNATURE_INVALID");
  const env = parsed.data;
  const { sig, ...rest } = env;
  if (!verifyHmac(canonical(rest), sig, "plan")) {
    throw new GuardrailError("プランの署名が一致しません（改ざんの可能性）", "SIGNATURE_INVALID");
  }
  if (Date.parse(env.expiresAt) < now) {
    throw new GuardrailError("プランの有効期限が切れています。再生成してください", "EXPIRED");
  }
  return env;
}

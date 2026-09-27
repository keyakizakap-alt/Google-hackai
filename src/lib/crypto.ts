import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

/**
 * SESSION_SECRET から用途別の鍵を導出する。
 * - 暗号化・署名は常に「今の値」で行う
 * - 読み取り・検証は「今の値」→「前の値（SESSION_SECRET_PREVIOUS）」の順に試す（鍵の入れ替えに対応）
 * 未設定の開発環境ではプロセス毎のランダム鍵を使う（再起動でセッションは失効）。
 */
const devFallback = randomBytes(32).toString("hex");

function secret(): string {
  if (config.sessionSecret) return config.sessionSecret;
  if (config.isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return devFallback;
}

function deriveKey(purpose: string, material = secret()): Buffer {
  return createHash("sha256").update(`${purpose}:${material}`).digest();
}

/** 検証・復号に使ってよい鍵（今の値が先頭） */
function verificationKeys(purpose: string): Buffer[] {
  return [secret(), ...config.sessionSecretPrevious].map((m) => deriveKey(purpose, m));
}

/** AES-256-GCM で暗号化し base64url で返す */
export function seal(plain: string, purpose = "session"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(purpose), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unseal(token: string, purpose = "session"): string | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(token, "base64url");
  } catch {
    return null;
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  for (const key of verificationKeys(purpose)) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    } catch {
      /* 次の鍵を試す */
    }
  }
  return null;
}

export function hmac(data: string, purpose = "plan"): string {
  return createHmac("sha256", deriveKey(purpose)).update(data).digest("base64url");
}

export function verifyHmac(data: string, sig: string, purpose = "plan"): boolean {
  const given = Buffer.from(sig);
  return verificationKeys(purpose).some((key) => {
    const expected = Buffer.from(createHmac("sha256", key).update(data).digest("base64url"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export const randomId = (bytes = 16) => randomBytes(bytes).toString("base64url");

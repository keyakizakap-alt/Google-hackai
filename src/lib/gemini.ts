import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse, type HttpRetryOptions } from "@google/genai";
import { config } from "./config";
import { logger } from "./logger";

/**
 * Gemini の呼び出しの共通部品（プラン作成・ライブの抽出・スクショの読み取りで使う）。
 *
 * - 混雑（429）や一時的な障害（5xx）は、待ち時間を延ばしながら自動で再試行する。
 *   公式の推奨どおり、待ち時間にはばらつき（jitter）を入れて一斉の再試行を避ける。
 *   この SDK（JavaScript 版）は retryOptions を渡さないと再試行しないため、ここで明示する。
 * - それでも使えないときだけ、GEMINI_FALLBACK_MODEL（予備のモデル）に切り替える。
 *   ルールで作った答えを「AI の成果」に見せかけることはしない（予備も Gemini）。
 */
export const GEMINI_RETRY: HttpRetryOptions = {
  attempts: 3, // 最初の 1 回を含む
  initialDelay: 1,
  maxDelay: 8,
  expBase: 2,
  jitter: 1,
  httpStatusCodes: [408, 429, 500, 502, 503, 504],
};

/** 1 回の呼び出しの待ち時間（ミリ秒）を指定してクライアントを作る */
export function createGenAI(timeoutMs: number): GoogleGenAI {
  const httpOptions = { timeout: timeoutMs, retryOptions: GEMINI_RETRY };
  return config.gemini.useVertex
    ? new GoogleGenAI({ vertexai: true, project: config.gemini.project, location: config.gemini.location, httpOptions })
    : new GoogleGenAI({ apiKey: config.gemini.apiKey, httpOptions });
}

/**
 * 予備のモデルに切り替えてよい失敗か。
 * 混雑・一時的な障害・モデルが見つからない（提供終了など）のときだけ切り替える。
 * 権限不足（403）や入力の誤り（400）は、モデルを変えても直らないので切り替えない。
 */
export function isModelUnavailable(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status === 404 || status === 408 || status === 429 || status >= 500);
}

/**
 * Gemini の API エラーから、原因の種類だけを取り出す（ログで原因を特定するため）。
 * Google の API は失敗理由を決まった英大文字の名前で返す（例: PERMISSION_DENIED / SERVICE_DISABLED / BILLING_DISABLED）。
 * 本文の説明文には URL やプロジェクト名が入るため、名前の形をしたものだけを返し、それ以外は捨てる。
 */
export function geminiErrorInfo(e: unknown): { apiStatus?: string; apiReason?: string } {
  const message = e instanceof Error ? e.message : "";
  const enumLike = (v: unknown) => (typeof v === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(v) ? v : undefined);
  try {
    const body = JSON.parse(message) as { error?: { status?: unknown; details?: { reason?: unknown }[] } };
    const reason = (body.error?.details ?? []).map((d) => enumLike(d?.reason)).find(Boolean);
    return { apiStatus: enumLike(body.error?.status), apiReason: reason };
  } catch {
    return {};
  }
}

/** 試すモデルの順番。予備が未設定、またはメインと同じなら 1 つだけ */
export function modelCandidates(): string[] {
  const { model, fallbackModel } = config.gemini;
  return fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model];
}

/** 1 回で終わる呼び出し（構造化出力など）を、必要なら予備のモデルでやり直す */
export async function generateWithFallback(
  ai: GoogleGenAI,
  request: Omit<GenerateContentParameters, "model">,
  meta: { requestId: string; route: string },
): Promise<{ res: GenerateContentResponse; model: string }> {
  const models = modelCandidates();
  for (let i = 0; ; i++) {
    try {
      return { res: await ai.models.generateContent({ ...request, model: models[i] }), model: models[i] };
    } catch (e) {
      if (i >= models.length - 1 || !isModelUnavailable(e)) throw e;
      logger.warn("gemini.model_fallback", { ...meta, httpStatus: (e as { status?: number }).status, ...geminiErrorInfo(e), model: models[i + 1] });
    }
  }
}

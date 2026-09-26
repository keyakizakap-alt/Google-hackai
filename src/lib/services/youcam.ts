import "server-only";
import type { SkinAnalysis } from "../agent/types";
import { config } from "../config";
import { logger } from "../logger";

/**
 * YouCam（Perfect Corp.）AI 肌解析のアダプタ。
 *
 * 現在はモック実装。実 API に接続する場合もこのインターフェースを保ったまま差し替える。
 * 顔画像は引数の Buffer としてメモリ上にのみ存在し、処理後に zero-fill して破棄する。
 * 画像・解析対象の生データはログにも永続化層にも出力しない。
 */
export async function analyzeSkin(image: Buffer): Promise<SkinAnalysis> {
  const started = Date.now();
  try {
    if (image.length === 0) throw new Error("empty image");
    // NOTE: 実 API 連携時はここで config.youcam.apiKey を用いてアップロード → 解析 → 結果取得を行う
    const result: SkinAnalysis = {
      source: "mock",
      scores: [
        { key: "moisture", label: "うるおい", score: 62 },
        { key: "texture", label: "キメ", score: 74 },
        { key: "redness", label: "赤み", score: 81 },
        { key: "dark_circle", label: "クマ", score: 58 },
      ],
      advice: [
        "うるおいスコアがやや低め。前日夜に保湿パックを入れると当日のメイクのりが安定します",
        "クマ対策として前日は 0 時までの就寝を推奨",
      ],
    };
    logger.info("youcam.analyze", { latencyMs: Date.now() - started, mode: config.youcam.apiKey ? "youcam-pending" : "mock" });
    return result;
  } finally {
    image.fill(0); // 顔画像バッファをメモリ上でも即座に消去
  }
}

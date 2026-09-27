import "server-only";
import { logger } from "../logger";

/**
 * YouCam（Perfect Corp.）AI 肌解析のアダプタ。
 *
 * 現在はモック実装。実 API に接続する場合もこのインターフェースを保ったまま差し替える。
 * 顔画像は引数の Buffer としてメモリ上にのみ存在し、処理後に zero-fill して破棄する。
 * 画像・解析対象の生データはログにも永続化層にも出力しない。
 */
export async function analyzeSkin(image: Buffer): Promise<never> {
  const started = Date.now();
  try {
    logger.info("youcam.unavailable", { latencyMs: Date.now() - started });
    throw new Error("肌解析は未接続です");
  } finally {
    image.fill(0); // 顔画像バッファをメモリ上でも即座に消去
  }
}

/**
 * 自動で作るプラン（ライブを登録した直後・初めて開いたとき）が失敗したとき、もう一度だけ自動でやり直してよいか。
 *
 * 初回は、Cloud Run の起動直後や AI の混雑で時間切れになりやすい。一時的な失敗なら、利用者に「もう一度作る」を
 * 押させる前に 1 回だけやり直す。権限・設定・入力の誤りは、やり直しても直らない（費用だけかかる）のでやり直さない。
 */
export function isTransientPlanFailure(e: { status?: number; reason?: string } | null | undefined): boolean {
  if (!e) return false;
  const { status, reason } = e;
  // 通信が切れた（応答がない）
  if (status === undefined) return true;
  if (status === 502 || status === 504) return true;
  if (status !== 503) return false;
  // AI に接続できなかった（503）：理由の種類で、やり直して直るものだけに絞る
  if (!reason) return true;
  return !/PERMISSION|DENIED|DISABLED|BILLING|INVALID|NOT_FOUND|UNAUTHENTICATED|HTTP_40[0-4]/.test(reason);
}

/** やり直すまでの待ち時間（混雑が収まるのを少し待つ） */
export const PLAN_RETRY_DELAY_MS = 3_000;

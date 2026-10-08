import "server-only";

/**
 * 同じ承認で予約を 2 回実行させないための記録（二重予約の防止）。
 *
 * 承認済みの封筒は 2 時間有効なので、同じものを 2 回送られると、そのままでは 2 回予約できてしまう。
 * DB を持たない設計のため、使った封筒の署名をメモリに期限まで覚えておく。
 * Cloud Run のインスタンスをまたぐと共有されない（max-instances=1 で運用。複数にするなら共有の保存先が要る）。
 * 実際の予約サービスにつなぐ部品は、あわせて冪等キー（idempotencyKey）で重複を防ぐ。
 */
const used = new Map<string, number>();

/** 初めて使う承認なら true を返して記録する。使用済みなら false */
export function claimApproval(sig: string, expiresAt: string, now = Date.now()): boolean {
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(sig)) return false;
  used.set(sig, Date.parse(expiresAt) || now + 2 * 3_600_000);
  return true;
}

/** 1 件も予約できずに失敗した場合は、やり直せるように記録を外す */
export function releaseApproval(sig: string) {
  used.delete(sig);
}

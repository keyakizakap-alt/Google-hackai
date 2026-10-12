/**
 * 新しい版のデプロイ後に、開いたままの古い画面から部品を読み込めなかったときの判定と、1 回だけの自動の読み込み直し。
 * 通常は next.config.ts の deploymentId により Next.js が自動で読み込み直すが、すり抜けた場合の保険として使う。
 */
const RELOAD_KEY = "oshiready.versionReload";

export function isStaleVersionError(error: { name?: string; message?: string } | null | undefined): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to load chunk|error loading dynamically/i.test(text);
}

/** 30 秒以内に読み込み直していなければ読み込み直す。読み込み直したら true */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false; // 直前にも読み込み直していたら繰り返さない
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* 保存できない環境でも 1 回は読み込み直す */
  }
  window.location.reload();
  return true;
}

/** エラー画面が出たことをサーバーのログに残す（原因の特定用。失敗しても画面には影響させない） */
export function reportClientError(kind: "global" | "page", error: { name?: string; message?: string; digest?: string }) {
  try {
    const body = JSON.stringify({ kind, name: error.name?.slice(0, 80), message: error.message?.slice(0, 500), digest: error.digest?.slice(0, 80), path: window.location.pathname.slice(0, 200) });
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* 送れなくても何もしない */
  }
}

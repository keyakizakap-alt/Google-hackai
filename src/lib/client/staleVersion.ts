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

/** 今の画面を読み込んだときの版（部品の URL の ?dpl=。古い版には無い） */
export function loadedDeploymentId(): string | null {
  for (const s of Array.from(document.scripts)) {
    const m = /[?&]dpl=([\w-]+)/.exec(s.src);
    if (m) return m[1];
  }
  return null;
}

/** サーバーで今動いている版 */
async function serverDeploymentId(): Promise<string | null> {
  try {
    const res = await fetch("/", { cache: "no-store", credentials: "same-origin" });
    const m = /[?&]dpl=([\w-]+)/.exec(await res.text());
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * 画面の版とサーバーの版が違えば（デプロイ前から開いていた画面）、1 回だけ読み込み直す。
 * 版が混ざると「〇〇 is not a function」のような、部品の読み込みエラーに見えない形で壊れることがあるため、
 * エラー画面が出たら種類によらず確かめる。読み込み直したら true
 */
export async function reloadIfNewVersion(): Promise<boolean> {
  const server = await serverDeploymentId();
  if (!server || server === loadedDeploymentId()) return false;
  return reloadOnceForNewVersion();
}

/** エラーの発生箇所（最初の 1 行。部品のファイル名と位置だけで、URL のドメインやクエリは含めない） */
function topFrame(stack: string | undefined): string | undefined {
  const line = (stack ?? "").split("\n").find((l) => /\.js/.test(l));
  const m = line ? /([\w.-]+\.js)(?:\?[^:)]*)?:(\d+):(\d+)/.exec(line) : null;
  return m ? `${m[1]}:${m[2]}:${m[3]}` : undefined;
}

/** エラー画面が出たことをサーバーのログに残す（原因の特定用。失敗しても画面には影響させない） */
export function reportClientError(kind: "global" | "page", error: { name?: string; message?: string; digest?: string; stack?: string }) {
  try {
    const body = JSON.stringify({
      kind,
      name: error.name?.slice(0, 80),
      message: error.message?.slice(0, 500),
      digest: error.digest?.slice(0, 80),
      path: window.location.pathname.slice(0, 200),
      frame: topFrame(error.stack),
      version: loadedDeploymentId() ?? undefined,
    });
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* 送れなくても何もしない */
  }
}

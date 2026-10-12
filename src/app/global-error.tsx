"use client";

import { useEffect } from "react";
import { isStaleVersionError, reloadOnceForNewVersion, reportClientError } from "@/lib/client/staleVersion";

/**
 * ルートのレイアウトごと表示できなかったときの最後の受け皿。
 * アプリのスタイルが読み込まれないため、最低限の見た目をここに直接書く。
 * 新しい版に切り替わった直後の読み込みエラーなら、1 回だけ自動で読み込み直す（この画面はほぼ一瞬で消える）。
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const stale = isStaleVersionError(error);
  useEffect(() => {
    if (stale) reloadOnceForNewVersion();
    else reportClientError("global", error);
  }, [stale, error]);
  return (
    <html lang="ja">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#1b1935", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <title>OshiReady</title>
        <div style={{ maxWidth: 420, padding: 28, textAlign: "center" }} role="alert">
          <p style={{ fontSize: 11, letterSpacing: "0.3em", opacity: 0.6, margin: 0 }}>SORRY</p>
          <h1 style={{ fontSize: 20, margin: "10px 0" }}>{stale ? "新しい版に切り替えています…" : "アプリを表示できませんでした"}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.8 }}>
            {stale ? "アプリが新しくなったため、読み込み直しています。" : "一時的な問題の可能性があります。読み込み直してください。"}登録したライブはこの端末に残っています。
          </p>
          {!stale && (
            <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
              エラーの種類：{error.name || "Error"}
              {error.digest ? `（番号 ${error.digest}）` : ""}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
            <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, border: 0, background: "#e88aa2", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              もう一度表示する
            </button>
            <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgb(255 255 255 / 0.3)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              読み込み直す
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

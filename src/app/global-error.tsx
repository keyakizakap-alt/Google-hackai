"use client";

/**
 * ルートのレイアウトごと表示できなかったときの最後の受け皿。
 * アプリのスタイルが読み込まれないため、最低限の見た目をここに直接書く。
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#1b1935", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <title>OshiReady</title>
        <div style={{ maxWidth: 420, padding: 28, textAlign: "center" }} role="alert">
          <p style={{ fontSize: 11, letterSpacing: "0.3em", opacity: 0.6, margin: 0 }}>SORRY</p>
          <h1 style={{ fontSize: 20, margin: "10px 0" }}>アプリを表示できませんでした</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.8 }}>一時的な問題の可能性があります。読み込み直してください。登録したライブはこの端末に残っています。</p>
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

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

const RELOAD_KEY = "oshiready.versionReload";

/** 新しい版がデプロイされた後、開いたままの古い画面から移動して部品を読み込めなかったときのエラーか */
function isStaleVersion(error: Error) {
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|Failed to load chunk/i.test(text);
}

/**
 * 画面の表示中に起きた想定外のエラー。サイドバー・下のメニューと、処理中の AI のプラン作成はそのまま残る。
 * 新しい版に切り替わった直後の読み込みエラーなら、1 回だけ自動で再読み込みする。
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const stale = isStaleVersion(error);
  useEffect(() => {
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 30_000) return; // 直前にも再読み込みしていたら繰り返さない
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* 保存できない環境でも 1 回は再読み込みする */
    }
    window.location.reload();
  }, [stale]);

  return (
    <div className="card mx-auto mt-8 max-w-lg p-7 text-center" role="alert">
      <p className="text-[10px] font-bold tracking-[0.3em] text-mute">{stale ? "UPDATED" : "SORRY"}</p>
      <h1 className="mt-2 text-lg font-bold text-ink">{stale ? "新しい版に切り替えています…" : "この画面を表示できませんでした"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {stale
          ? "アプリが新しくなったため、画面を読み込み直しています。数秒たっても変わらないときは、下のボタンを押してください。"
          : "一時的な問題の可能性があります。もう一度表示するか、ホームに戻ってください。作成中のプランや登録したライブは消えていません。"}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : retry())}
          className="btn-primary flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          {stale ? "読み込み直す" : "もう一度表示する"}
        </button>
        <Link href="/" className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:bg-lav-50">
          ホームに戻る
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-[11px] text-mute">問い合わせ用の番号：{error.digest}</p>}
    </div>
  );
}

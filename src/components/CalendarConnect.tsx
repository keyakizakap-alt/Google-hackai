"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { GoogleG } from "./brand";
import { useStore } from "./store";

/**
 * 「Google で連携」ボタン。押すと Google の確認画面が開き、「許可」を押すだけで連携が終わる。
 * 連携の準備（アプリ側の初期設定）が済んでいない場合も押せるようにし、理由は戻り先の画面で知らせる。
 */
export function GoogleConnectButton({ className = "", label = "Google で連携する" }: { className?: string; label?: string }) {
  return (
    <a href="/api/auth/google" className={`inline-flex items-center justify-center gap-2 ${className}`}>
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white">
        <GoogleG className="h-3.5 w-3.5" />
      </span>
      {label}
    </a>
  );
}

const MESSAGES: Record<string, { tone: "ok" | "ng"; text: string }> = {
  connected: { tone: "ok", text: "Google カレンダーと連携しました。ライブの予定を探しています…" },
  oauth_not_configured: {
    tone: "ng",
    text: "Google カレンダー連携の準備がまだ整っていません。アプリの管理者が最初に一度だけ設定すると、ボタンを押すだけで連携できるようになります。いまはスクショや文章からライブを登録できます。",
  },
  oauth_denied: { tone: "ng", text: "連携はキャンセルされました。もう一度「Google で連携する」を押すと、いつでもやり直せます。" },
  oauth_state: { tone: "ng", text: "連携の途中で時間が切れました。もう一度「Google で連携する」を押してください。" },
  oauth_token: { tone: "ng", text: "Google から許可を受け取れませんでした。少し待ってから、もう一度お試しください。" },
};

/** 連携後に戻ってきたときの結果を、画面上部に一度だけ表示する */
export function CalendarConnectNotice() {
  const q = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { refreshSession } = useStore();
  const key = q.get("connected") === "1" ? "connected" : (q.get("error") ?? "");
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!MESSAGES[key]) return;
    const timer = setTimeout(() => {
      setShown(key);
      if (key === "connected") void refreshSession();
      // 再読み込みで同じ表示が出ないよう、URL から結果を消す
      router.replace(path, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [key, path, router, refreshSession]);

  const m = shown ? MESSAGES[shown] : null;
  if (!m) return null;
  return (
    <div
      role={m.tone === "ng" ? "alert" : "status"}
      className={`pop-in mb-5 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${m.tone === "ok" ? "bg-lav-50 text-ink" : "bg-rose-50 text-ink"}`}
    >
      {m.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lav-600" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
      <p className="flex-1 leading-relaxed">{m.text}</p>
      <button onClick={() => setShown(null)} className="grid h-8 w-8 place-items-center text-mute hover:text-ink" aria-label="閉じる">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

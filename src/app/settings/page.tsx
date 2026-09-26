"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Bot, CalendarCheck, Camera, ShieldCheck, TrainFront } from "lucide-react";
import { GoogleG } from "@/components/brand";
import { useStore } from "@/components/store";

function Row({ icon, title, status, desc, action }: { icon: React.ReactNode; title: string; status: string; desc: string; action?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
          {title}
          <span className="rounded-full bg-lav-100 px-2 py-0.5 text-[10px] font-semibold text-lav-700">{status}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{desc}</p>
      </div>
      {action}
    </li>
  );
}

function OAuthNotice() {
  const q = useSearchParams();
  if (q.get("error") !== "oauth_not_configured") return null;
  return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-500">いまは Google カレンダーと連携できない状態です。お試し用の予定で体験できます。</p>;
}

export default function SettingsPage() {
  const { session, disconnect } = useStore();
  return (
    <div className="space-y-5 px-1">
      <div>
        <h1 className="text-xl font-bold text-ink">設定</h1>
        <p className="mt-1 text-sm text-ink-soft">連携サービスの状態とプライバシー設定です。</p>
      </div>
      <Suspense>
        <OAuthNotice />
      </Suspense>

      <section className="card px-5">
        <ul className="divide-y divide-line">
          <Row
            icon={<GoogleG className="h-5 w-5" />}
            title="Google カレンダー"
            status={session?.calendarConnected ? "連携中" : "お試し中"}
            desc="予定を見るだけで、書き換えることはありません。空き時間は予定の時間だけから計算します。ライブを探すときだけ予定の名前・場所・日時を確認し、ライブ以外の予定はすぐに捨てます。"
            action={
              session?.calendarConnected ? (
                <button onClick={() => void disconnect()} className="rounded-xl border border-line px-4 py-2 text-xs text-ink-soft hover:bg-lav-50">
                  連携を解除
                </button>
              ) : session?.googleOAuthConfigured ? (
                <a href="/api/auth/google" className="btn-primary rounded-xl px-4 py-2 text-xs font-bold text-white">
                  連携する
                </a>
              ) : null
            }
          />
          <Row
            icon={<Bot className="h-5 w-5" />}
            title="AI プランナー"
            status={session?.gemini.configured ? "利用中" : "かんたんモード"}
            desc="Google の AI が、空き時間・サロンの空き・会場の混雑・移動ルートを自分で調べてプランを作ります。かんたんモードでは決まったルールで作ります。"
          />
          <Row
            icon={<TrainFront className="h-5 w-5" />}
            title="乗換案内（駅すぱあと）"
            status={session?.ekispert.mode === "mcp" ? "連携中" : "目安表示"}
            desc="電車の時刻・乗り換え・運賃を調べます。連携していないときは所要時間と運賃の目安を表示します。"
          />
          <Row
            icon={<Camera className="h-5 w-5" />}
            title="AI 肌診断（YouCam）"
            status={session?.youcam.mode === "api" ? "利用中" : "お試し版"}
            desc="顔写真は診断のあとすぐに消去し、保存しません。"
          />
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-lav-600" /> あなたの情報の扱い
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />カレンダーの予定や顔写真は、どこにも保存しません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />AI が勝手に予約や支払いをすることはありません。提案は必ずあなたの確認待ちで止まります。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />あなたが承認していないプランは、予約の手続きに進めない仕組みになっています。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />Google との連携情報は暗号化してこのブラウザにだけ保存し、24 時間で自動的に切れます。</li>
        </ul>
      </section>
    </div>
  );
}

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
  return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-500">Google OAuth クライアントが未設定です（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）。デモカレンダーで体験できます。</p>;
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
            status={session?.calendarConnected ? "連携済み" : "デモモード"}
            desc="権限は「予定の閲覧のみ」。空き時間の計算は時間帯だけで行います。ライブの自動取り込み時はタイトル・場所・日時を一時的に読み、ライブ以外の予定は即破棄します（参加者・説明文は受信しません）。"
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
            title="AI エージェント"
            status={session?.gemini.configured ? session.gemini.model : "ルールベース"}
            desc={`${session?.gemini.platform ?? "Gemini API"} の Function Calling で、空き時間・サロン・混雑・経路のツールを自律的に呼び出して計画します。`}
          />
          <Row
            icon={<TrainFront className="h-5 w-5" />}
            title="駅すぱあと API MCP サーバー"
            status={session?.ekispert.mode === "mcp" ? "MCP 接続" : "モック"}
            desc="MCP の tools/list から経路探索ツールを動的に取得し、Gemini に公開します。"
          />
          <Row
            icon={<Camera className="h-5 w-5" />}
            title="YouCam AI 肌解析"
            status={session?.youcam.mode === "api" ? "API" : "モック"}
            desc="顔画像はメモリ上でのみ処理し、解析直後に破棄します。"
          />
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-lav-600" /> プライバシーと安全設計
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />カレンダー・顔画像はデータベースにもログにも保存しません（オンメモリ処理のみ）。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />AI には予約・決済のツールを渡していません。すべての提案は「承認待ち」で止まります。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />プランはサーバー署名付き。承認を飛ばした予約や改ざんはサーバーで拒否されます。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />OAuth トークンは暗号化 Cookie（24 時間で失効）にのみ保持します。</li>
        </ul>
      </section>
    </div>
  );
}

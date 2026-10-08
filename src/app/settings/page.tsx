"use client";

import { Bot, CalendarCheck, CalendarHeart, ImageIcon, Radar, ShieldCheck, TrainFront } from "lucide-react";
import { GoogleG } from "@/components/brand";
import { DemoCalendarButton, GoogleConnectButton, useCalendarLinks } from "@/components/CalendarConnect";
import { OshiColorPicker } from "@/components/AppShell";
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

export default function SettingsPage() {
  const { session, disconnect, stopDemoCalendar, persistImages, setPersistImages, clearSavedImages, clearLocalData, oshiImages, autoPlan, setAutoPlan, autoReview, setAutoReview } = useStore();
  const saved = Object.keys(oshiImages).length;
  const { googleConnected, demoAvailable, demoConnected } = useCalendarLinks();
  return (
    <div className="space-y-5 px-1">
      <div>
        <h1 className="text-xl font-bold text-ink">設定</h1>
        <p className="mt-1 text-sm text-ink-soft">連携サービスの状態とプライバシー設定です。</p>
      </div>

      <section className="card px-5">
        <ul className="divide-y divide-line">
          <Row
            icon={<GoogleG className="h-5 w-5" />}
            title="Google カレンダー"
            status={googleConnected ? "連携中" : "未連携"}
            desc="予定を見るだけで、書き換えることはありません。空き時間は予定の時間だけから計算します。ライブを探すときだけ予定の名前・場所・日時を確認し、ライブ以外の予定はすぐに捨てます。"
            action={
              googleConnected ? (
                <button onClick={() => void disconnect()} className="rounded-xl border border-line px-4 py-2 text-xs text-ink-soft hover:bg-lav-50">
                  連携を解除
                </button>
              ) : session ? (
                <GoogleConnectButton className="btn-primary min-h-[44px] shrink-0 rounded-xl px-4 text-xs font-bold text-white" />
              ) : null
            }
          />
          {demoAvailable && (
            <Row
              icon={<CalendarHeart className="h-5 w-5" />}
              title="デモのカレンダー"
              status={demoConnected ? "表示中" : "未使用"}
              desc="ログインなしで、架空の予定が入ったデモ用カレンダーとの連携を体験できます。ライブの自動取り込みや空き時間の表示を、実際の連携と同じ流れで試せます。"
              action={
                demoConnected ? (
                  <button onClick={() => void stopDemoCalendar()} className="rounded-xl border border-line px-4 py-2 text-xs text-ink-soft hover:bg-lav-50">
                    デモをやめる
                  </button>
                ) : (
                  <DemoCalendarButton className="min-h-[44px] shrink-0 rounded-xl border border-line px-4 text-xs font-bold text-ink hover:bg-lav-50" label="デモで試す" />
                )
              }
            />
          )}
          <Row
            icon={<Bot className="h-5 w-5" />}
            title="AI プランナー"
            status={session?.gemini.configured ? "利用中" : "かんたん提案"}
            desc="Google の AI が空き時間と施術候補日時を調べてプランを作ります。店舗の空席・料金と経路は確認できた場合のみ表示します。AI を使えないときは、美容や移動の一般的な目安にそって提案します。"
          />
          <Row
            icon={<ShieldCheck className="h-5 w-5" />}
            title="アプリ内の予約・キャンセル"
            status={session?.booking?.inApp ? (session.booking.demo ? "デモ予約" : "利用中") : "予約サイトへ案内"}
            desc={
              session?.booking?.inApp
                ? `プランを承認して「予約する」を押したものだけ、アプリ内で予約し、予約の管理からキャンセルできます。AI が勝手に予約・キャンセルすることはありません。${session.booking.demo ? "いまはデモ予約のため、予約番号は発行されますが実在の店舗・交通機関・宿には届きません。" : ""}`
                : "予約は各予約サイトで行い、アプリでは手続きの状況を管理します。"
            }
          />
          <Row
            icon={<TrainFront className="h-5 w-5" />}
            title="乗換案内（駅すぱあと）"
            status={session?.ekispert.mode === "mcp" ? "利用中" : "未連携"}
            desc="乗り換えの情報を調べられたときだけ、時刻・乗り換え・運賃を表示します。調べられないときは乗り換え案内のサイトをご案内します。"
          />
        </ul>
      </section>

      <section className="card p-5" aria-label="推しカラー">
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">アプリ全体のアクセントカラーを推しの色にできます。選んだ色はこの端末に記憶されます。</p>
        <OshiColorPicker light />
      </section>

      <section className="card p-5" aria-labelledby="auto-plan">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="auto-plan" className="font-bold text-ink">準備プランを自動で作る</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              イベントが登録されると、AI が空き時間・美容のタイミング・混雑と移動を自分で調べて、準備プランを自動で作ります。予約はあなたが確認して承認するまで進みません。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoPlan}
            aria-labelledby="auto-plan"
            onClick={() => setAutoPlan(!autoPlan)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${autoPlan ? "bg-rose-400" : "bg-lav-200"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${autoPlan ? "left-7" : "left-1"}`} />
          </button>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="auto-review">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">
            <Radar className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="auto-review" className="font-bold text-ink">承認したあとも見張って、見直し案を作る</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              承認したプランと、カレンダーに後から入った予定・公演日の天気を見比べます（調べるだけなら AI は使いません）。
              困ることが見つかったら、AI が見直し案を作ります（同じ変化につき 1 回）。今のプランや予約は変えず、切り替えるかはあなたが決めます。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoReview}
            aria-labelledby="auto-review"
            onClick={() => setAutoReview(!autoReview)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${autoReview ? "bg-rose-400" : "bg-lav-200"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${autoReview ? "left-7" : "left-1"}`} />
          </button>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="img-save">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">
            <ImageIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="img-save" className="font-bold text-ink">推し画像をこの端末に保存する</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              オンにすると、推し画像をこの端末の中だけに保存し、次に開いたときも表示します。端末の外には送りません。
              共用のパソコンではオフにするか、使い終わったら削除してください。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={persistImages}
            aria-labelledby="img-save"
            onClick={() => setPersistImages(!persistImages)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${persistImages ? "bg-rose-400" : "bg-lav-200"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${persistImages ? "left-7" : "left-1"}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cloud px-4 py-3 text-xs text-ink-soft">
          <span>{persistImages ? `保存中の推し画像：${saved} 枚` : "保存はオフです（画面を閉じると消えます）"}</span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("この端末に保存した推し画像をすべて削除します。よろしいですか？")) void clearSavedImages();
            }}
            disabled={saved === 0}
            className="min-h-[40px] rounded-lg border border-line bg-white px-3 font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-40"
          >
            保存した画像をすべて削除
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-lav-600" /> あなたの情報の扱い
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />公演・プラン・予約メモはこの端末に保存します。Google カレンダーの予定や顔写真は保存しません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />AI が勝手に予約・キャンセル・支払いをすることはありません。提案は必ずあなたの確認待ちで止まります。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />リマインドはこの端末の中だけで作ります。予定を端末の外に送ったり保存したりしません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />あなたが承認していないプランは、予約の手続きに進めない仕組みになっています。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />Google との連携は、鍵をかけてこの端末にだけ記録し、24 時間で自動的に切れます。</li>
        </ul>
        <button type="button" onClick={() => {
          if (window.confirm("この端末に保存した公演・プラン・予約メモを削除しますか？")) void clearLocalData();
        }} className="my-4 min-h-[44px] rounded-xl border border-rose-200 px-4 text-sm text-rose-600">
          公演・プラン・予約メモを削除
        </button>
      </section>
    </div>
  );
}

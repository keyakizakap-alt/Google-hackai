"use client";

import Link from "next/link";
import { Bot, CalendarCheck, CalendarHeart, ImageIcon, ImagePlus, Radar, ShieldCheck, TrainFront, Trash2 } from "lucide-react";
import { StageScene } from "@/components/StageScene";
import { GoogleG } from "@/components/brand";
import { DemoCalendarButton, GoogleConnectButton, useCalendarLinks } from "@/components/CalendarConnect";
import { OshiColorPicker } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/components/store";

/** 状態の札の色。つながっている＝緑、別の手段で代わりに動いている＝紫、未設定・準備中＝灰 */
type Tone = "ok" | "alt" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  alt: "bg-lav-100 text-lav-700",
  off: "bg-cloud text-mute",
};

function Row({ icon, title, status, desc, action, tone = "alt" }: { icon: React.ReactNode; title: string; status: string; desc: string; action?: React.ReactNode; tone?: Tone }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lav-50 text-lav-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
          {title}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[tone]}`}>{status}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{desc}</p>
      </div>
      {action}
    </li>
  );
}

export default function SettingsPage() {
  const { session, disconnect, stopDemoCalendar, persistImages, setPersistImages, clearSavedImages, clearLocalData, oshiImages, autoPlan, setAutoPlan, autoReview, setAutoReview, event, eventImage, setEventImage } = useStore();
  const saved = Object.keys(oshiImages).length;
  const { googleConnected, demoAvailable, demoConnected } = useCalendarLinks();
  // Google の連携は「つながっている」「デモで代わりに連携中」「未連携」「まだ使えない（管理者の設定待ち）」を分けて見せる
  const googleReady = Boolean(session?.googleOAuthConfigured);
  const googleStatus = googleConnected ? "連携中" : demoConnected ? "デモのカレンダーで連携中" : googleReady ? "未連携" : "準備中";
  const googleTone: Tone = googleConnected ? "ok" : demoConnected ? "alt" : "off";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="設定">
        つないでいるサービスと、プライバシーの設定です。
      </PageHeader>

      <section className="card px-5">
        <ul className="divide-y divide-line">
          <Row
            icon={<GoogleG className="h-5 w-5" />}
            title="Google カレンダー"
            status={googleStatus}
            tone={googleTone}
            desc={`予定は見るだけで、書き換えません。空き時間は予定の時間だけで計算します。予定の名前・場所・日時はライブ探しにだけ使い、ほかの予定はすぐに捨てます。${
              !googleConnected && demoConnected ? "いまはデモのカレンダーにつながっていて、取り込みも空き時間もデモの予定を使っています。ご自分の予定で使うときは「Google で連携する」を押してください。" : ""
            }${!googleReady ? "ご自分の Google カレンダーは、管理者の設定が済むとつなげるようになります。" : ""}`}
            action={
              googleConnected ? (
                <button onClick={() => void disconnect()} className="rounded-xl border border-line px-4 py-2 text-xs text-ink-soft hover:bg-lav-50">
                  連携を解除
                </button>
              ) : session && googleReady ? (
                <GoogleConnectButton className="btn-primary min-h-[44px] shrink-0 rounded-xl px-4 text-xs font-bold text-white" />
              ) : null
            }
          />
          {demoAvailable && (
            <Row
              icon={<CalendarHeart className="h-5 w-5" />}
              title="デモのカレンダー"
              status={demoConnected ? "連携中" : "未使用"}
              tone={demoConnected ? "ok" : "off"}
              desc="架空の予定が入ったカレンダーで、ログインなしに試せます。ライブの取り込みも空き時間の表示も、本番と同じ流れです。"
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
            title="プラン作成（Gemini）"
            status={session?.gemini.configured ? "利用中" : "かんたん提案"}
            tone={session?.gemini.configured ? "ok" : "alt"}
            desc="Gemini が空き時間や美容の候補日を調べて、プランを作ります。お店・料金・経路は、調べられたときだけ出します。Gemini を使えないときは、美容や移動の一般的な目安で提案します。"
          />
          <Row
            icon={<ShieldCheck className="h-5 w-5" />}
            title="アプリ内の予約・キャンセル"
            status={session?.booking?.inApp ? (session.booking.demo ? "デモ予約" : "利用中") : "予約サイトへ案内"}
            desc={
              session?.booking?.inApp
                ? `承認して「予約する」を押したものだけを予約します。キャンセルは「予約の管理」からできます。AI が勝手に予約やキャンセルをすることはありません。${session.booking.demo ? "いまはデモ予約です。予約番号は出ますが、実在のお店・交通機関・宿には届きません。" : ""}`
                : "予約はそれぞれのサイトで行い、進み具合をアプリに記録します。"
            }
          />
          <Row
            icon={<TrainFront className="h-5 w-5" />}
            title="乗換案内（駅すぱあと）"
            status={session?.ekispert.mode === "mcp" ? "利用中" : "目安で計算"}
            tone={session?.ekispert.mode === "mcp" ? "ok" : "alt"}
            desc="調べられたときは、時刻・乗り換え・運賃を出します。調べられないときは、乗換案内のサイトを案内します。"
          />
        </ul>
      </section>

      <section className="card p-5" aria-labelledby="ai-permissions">
        <h2 id="ai-permissions" className="flex items-center gap-2 font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-lav-600" />
          AI ができること・できないこと
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          AI ができるのは、調べて提案するところまでです。決めたり実行したりするのは、あなたが操作したときだけです。仕組みとテストで確かめています。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-mute">
                <th className="py-2 pr-3 font-bold">操作</th>
                <th className="px-3 py-2 font-bold">AI</th>
                <th className="px-3 py-2 font-bold">見張り（自動）</th>
                <th className="py-2 pl-3 font-bold">あなた</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {PERMISSIONS.map(([what, ai, watch, you]) => (
                <tr key={what}>
                  <td className="py-2.5 pr-3 font-bold">{what}</td>
                  <PermCell v={ai} />
                  <PermCell v={watch} />
                  <PermCell v={you} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5" aria-label="推しカラー">
        <p className="mb-3 text-xs leading-relaxed text-ink-soft">アプリの差し色を推しの色にできます。選んだ色はこの端末に残ります。</p>
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
              ライブを登録すると、空き時間や美容のタイミング、混雑と移動を調べて、準備プランを自動で作ります。予約は、あなたが承認するまで進みません。
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
              承認したプランを、あとから入った予定や公演日の天気と見比べます。
              困りそうなことがあれば、見直し案を作ります。同じ変化で作るのは 1 回だけです。今のプランや予約はそのままで、切り替えるかはあなたが決めます。
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
          <div className="min-w-0 flex-1 basis-40">
            <h2 id="img-save" className="font-bold text-ink">推し画像</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              選んだ画像は、ホームのチケットの背景になります。「この端末に保存」をオンにすると、次に開いたときも出ます。画像は端末の外に送りません。
              共用のパソコンでは、オフにするか、使い終わったら消してください。
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-ink-soft">
            この端末に保存
          <button
            type="button"
            role="switch"
            aria-checked={persistImages}
            aria-label="推し画像をこの端末に保存する"
            onClick={() => setPersistImages(!persistImages)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${persistImages ? "bg-rose-400" : "bg-lav-200"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${persistImages ? "left-7" : "left-1"}`} />
          </button>
          </span>
        </div>
        {/* 推し画像を選ぶ（ホームのチケットにも表示される。推し＝アーティストごとに 1 枚）。イベント画面から移した、大きな見本つきの欄 */}
        <div className="mt-4 rounded-xl border border-line p-4">
          {event ? (
            <>
              <p className="text-sm font-bold text-ink">{event.artist} の推し画像</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                同じアーティストのライブすべてで、チケットの背景に使います。画像は端末の外に送りません。
                {persistImages ? "この端末に保存するので、次に開いたときも出ます。" : "「この端末に保存」をオンにすると、次に開いたときも出ます。"}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-soft">
              ライブを登録すると、推しごとに画像を選べます。
              <Link href="/events" className="ml-1 font-bold text-lav-700 underline-offset-2 hover:underline">
                ライブを登録
              </Link>
            </p>
          )}
          <div className="relative mt-3 h-44 overflow-hidden rounded-2xl sm:h-56">
            {eventImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL（端末の中だけ）
              <img src={eventImage} alt={event ? `${event.artist} の推し画像` : "推し画像"} className="kenburns h-full w-full object-cover" />
            ) : (
              <StageScene className="relative h-full w-full" crowd={18} />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line px-4 text-xs font-bold text-ink-soft ${event ? "cursor-pointer hover:bg-lav-50" : "cursor-not-allowed opacity-50"}`}>
              <ImagePlus className="h-4 w-4" /> {eventImage ? "画像を変更" : "推し画像を選ぶ"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={!event}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setEventImage(f);
                }}
              />
            </label>
            {eventImage && (
              <button type="button" onClick={() => setEventImage(null)} className="flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-xs text-mute hover:text-ink">
                <Trash2 className="h-4 w-4" /> 外す
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cloud px-4 py-3 text-xs text-ink-soft">
          <span>{persistImages ? `保存中の推し画像：${saved} 枚` : "保存はオフです。画面を閉じると消えます"}</span>
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
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />公演・プラン・予約メモはこの端末に保存します。Google カレンダーの予定は保存しません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />AI が勝手に予約・キャンセル・支払いをすることはありません。提案はいつも、あなたの確認待ちで止まります。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />リマインドはこの端末の中で作ります。予定を外に送ったり、保存したりはしません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />承認していないプランは、予約に進めません。</li>
          <li className="flex gap-2"><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-lav-500" />Google との連携の情報は、暗号化してこの端末にだけ置きます。24 時間で自動で切れます。</li>
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

/** [操作, AI, 見張り, あなた]。値は「○」「×」か、条件つきの短い説明 */
const PERMISSIONS: readonly (readonly [string, string, string, string])[] = [
  ["カレンダーを読む", "○ 時間帯だけ", "○ 時間帯だけ", "○"],
  ["カレンダーに書き込む", "×", "×", "× その権限がありません"],
  ["天気・乗り換え・立ち寄り先を調べる", "○", "○ 天気", "—"],
  ["プランを作る・直す", "○ 提案まで", "○ 変化があるときだけ見直し案", "○"],
  ["承認・見送り", "×", "×", "○"],
  ["予約・キャンセル", "×", "×", "○ 確認してから。1 つの承認で 1 回まで"],
  ["支払い", "×", "×", "× その機能がありません"],
  ["予約サイトのリンクを出す", "許可したサイトだけ", "—", "—"],
];

function PermCell({ v }: { v: string }) {
  const tone = v.startsWith("○") ? "text-lav-700" : v.startsWith("×") ? "text-rose-500" : "text-ink-soft";
  return <td className={`px-3 py-2.5 ${tone}`}>{v}</td>;
}

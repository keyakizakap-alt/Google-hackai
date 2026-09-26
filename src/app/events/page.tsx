"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, LoaderCircle, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { StageScene } from "@/components/StageScene";
import { useStore } from "@/components/store";
import { BEAUTY_LABEL, BEAUTY_SERVICES, OshiEventSchema, type BeautyService } from "@/lib/agent/types";

/** 顔画像はブラウザ内で縮小（長辺 1024px）してからメモリ上の data URL として保持する */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const field = "mt-1.5 w-full rounded-xl border border-line bg-cloud px-3 py-2.5 text-sm outline-none focus:border-lav-400 focus:bg-white";

export default function EventsPage() {
  const { event, setEvent, eventImage, setEventImage, selfie, setSelfie, generatePlan, busy, session } = useStore();
  const router = useRouter();
  const [form, setForm] = useState({
    artist: event.artist,
    title: event.title,
    venue: event.venue,
    venueStation: event.venueStation,
    date: event.startAt.slice(0, 10),
    time: event.startAt.slice(11, 16),
    homeStation: event.homeStation,
    beautyServices: event.beautyServices as BeautyService[],
    arriveEarlyForGoods: event.arriveEarlyForGoods,
  });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const parsed = OshiEventSchema.safeParse({
      id: event.id,
      artist: form.artist,
      title: form.title,
      venue: form.venue,
      venueStation: form.venueStation,
      startAt: `${form.date}T${form.time}:00+09:00`,
      homeStation: form.homeStation,
      beautyServices: form.beautyServices,
      arriveEarlyForGoods: form.arriveEarlyForGoods,
    });
    if (!parsed.success) {
      setErr("未入力の項目があります");
      return null;
    }
    if (Date.parse(parsed.data.startAt) < Date.now()) {
      setErr("イベント日時は未来の日付を指定してください");
      return null;
    }
    setErr(null);
    setEvent(parsed.data);
    return parsed.data;
  };

  return (
    <div className="space-y-5 px-1">
      <div>
        <h1 className="text-xl font-bold text-ink">イベント設定</h1>
        <p className="mt-1 text-sm text-ink-soft">推しに会う日の情報を入力すると、そこから逆算して準備プランを作ります。</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-soft">
              アーティスト
              <input className={field} value={form.artist} onChange={(e) => set("artist", e.target.value)} maxLength={60} />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              公演名
              <input className={field} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              日付
              <input type="date" className={field} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              開演時刻
              <input type="time" className={field} value={form.time} onChange={(e) => set("time", e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              会場
              <input className={field} value={form.venue} onChange={(e) => set("venue", e.target.value)} maxLength={60} />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              会場最寄り駅
              <input className={field} value={form.venueStation} onChange={(e) => set("venueStation", e.target.value)} maxLength={40} />
            </label>
            <label className="text-xs font-semibold text-ink-soft sm:col-span-2">
              出発駅（自宅最寄り・サロンもこの周辺で探します）
              <input className={field} value={form.homeStation} onChange={(e) => set("homeStation", e.target.value)} maxLength={40} />
            </label>
          </div>

          <fieldset className="mt-6">
            <legend className="text-xs font-semibold text-ink-soft">事前に行きたい美容メニュー</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {BEAUTY_SERVICES.map((s) => {
                const on = form.beautyServices.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("beautyServices", on ? form.beautyServices.filter((x) => x !== s) : [...form.beautyServices, s])}
                    className={`rounded-full border px-4 py-2 text-sm transition ${on ? "border-lav-400 bg-lav-100 font-bold text-lav-700" : "border-line bg-white text-ink-soft hover:border-lav-200"}`}
                  >
                    {BEAUTY_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-5 flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-[#655da3]" checked={form.arriveEarlyForGoods} onChange={(e) => set("arriveEarlyForGoods", e.target.checked)} />
            物販に並ぶため早めに現地入りしたい
          </label>

          {err && <p className="mt-4 text-sm text-rose-500">{err}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => {
                if (save()) router.push("/");
              }}
              className="rounded-xl border border-line px-6 py-3 text-sm font-semibold text-ink-soft hover:bg-lav-50"
            >
              保存
            </button>
            <button
              onClick={async () => {
                const saved = save();
                if (saved && (await generatePlan(saved))) router.push("/plan");
              }}
              disabled={busy !== null}
              className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
            >
              {busy === "planning" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              保存して AI にプランを作ってもらう
            </button>
          </div>
        </section>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-[15px] font-bold text-ink">イベント画像</h2>
            <p className="mt-1 text-xs text-mute">お気に入りの画像を設定できます（この端末のメモリ上でのみ表示・送信しません）。</p>
            <div className="relative mt-3 h-36 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {eventImage ? <img src={eventImage} alt="" className="h-full w-full object-cover" /> : <StageScene className="relative h-full w-full" crowd={18} />}
            </div>
            <div className="mt-3 flex gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs text-ink-soft hover:bg-lav-50">
                <ImagePlus className="h-4 w-4" /> 画像を選ぶ
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setEventImage(URL.createObjectURL(e.target.files[0]))} />
              </label>
              {eventImage && (
                <button onClick={() => setEventImage(null)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-mute hover:text-ink">
                  <Trash2 className="h-4 w-4" /> 解除
                </button>
              )}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <Camera className="h-5 w-5 text-lav-600" /> AI 肌解析（任意）
              <span className="ml-auto rounded-full bg-lav-50 px-2 py-0.5 text-[10px] font-semibold text-lav-600">YouCam {session?.youcam.mode === "api" ? "API" : "モック"}</span>
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              素顔の写真から肌状態を解析し、前日のセルフケアをプランに組み込みます。
            </p>
            <div className="mt-3 rounded-xl bg-lav-50/70 p-3 text-[11px] leading-relaxed text-ink-soft">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <ShieldCheck className="h-3.5 w-3.5" /> 顔画像の取り扱い
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>解析のためにメモリ上でのみ処理し、保存・ログ出力はしません</li>
                <li>サーバーでは解析直後に画像データを消去します</li>
                <li>AI（Gemini）には画像ではなく解析スコアのみを渡します</li>
              </ul>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#655da3]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              上記に同意して写真を解析に使用します
            </label>
            <div className="mt-3 flex items-center gap-2">
              <label className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs ${consent ? "cursor-pointer border-lav-400 text-lav-700 hover:bg-lav-50" : "cursor-not-allowed border-line text-mute"}`}>
                <Camera className="h-4 w-4" /> 写真を選ぶ
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  disabled={!consent}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) setSelfie(await downscale(f));
                  }}
                />
              </label>
              {selfie && (
                <>
                  <span className="text-xs font-semibold text-lav-700">✓ 次回のプラン作成で解析します</span>
                  <button onClick={() => setSelfie(null)} className="ml-auto text-xs text-mute hover:text-ink">
                    取り消す
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

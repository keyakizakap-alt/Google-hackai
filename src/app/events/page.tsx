"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, LoaderCircle, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { StageScene } from "@/components/StageScene";
import { useStore } from "@/components/store";
import { BEAUTY_LABEL, BEAUTY_SERVICES, OshiEventSchema, type BeautyService, type OshiEvent } from "@/lib/agent/types";
import { GoogleG } from "@/components/brand";
import { DemoCalendarButton, GoogleConnectButton, useCalendarLinks } from "@/components/CalendarConnect";
import { ScanImportButton } from "@/components/ScanImport";
import { formatJst } from "@/lib/time";
import { matchVenue, VENUES } from "@/lib/eventDetection/venues";

const field = "mt-1.5 w-full rounded-xl border border-line bg-cloud px-3 py-2.5 text-sm outline-none focus:border-lav-400 focus:bg-white";

type FormState = {
  artist: string;
  title: string;
  venue: string;
  venueStation: string;
  date: string;
  time: string;
  homeStation: string;
  beautyServices: BeautyService[];
  arriveEarlyForGoods: boolean;
};

/** 登録済みイベント一覧 + カレンダー取り込み */
function RegisteredEvents({ editingId, onEdit }: { editingId: string | null; onEdit: (id: string | null) => void }) {
  const { events, event, selectEvent, removeEvent, importFromCalendar, lastImport, busy, session } = useStore();
  const { demoAvailable } = useCalendarLinks();
  const importing = busy === "importing";
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="registered">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-mute">My Lives</p>
          <h2 id="registered" className="text-[17px] font-bold text-ink">登録イベント</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {session && !session.calendarConnected && (
            <>
              <GoogleConnectButton className="min-h-[44px] rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-lav-50" label="Google カレンダーと連携" />
              {demoAvailable && <DemoCalendarButton className="min-h-[44px] rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-lav-50" />}
            </>
          )}
          <ScanImportButton className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-lav-50" />
          <button onClick={() => void importFromCalendar()} disabled={busy !== null || !session?.calendarConnected} className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-40">
            {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            カレンダーから取り込む
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-mute">
        {session?.calendarConnected ? "Google カレンダーの今後 6 か月の予定から、ライブ・公演らしい予定だけを見つけて登録します。" : "連携前は、スクショ・文章からの追加か手動で公演を登録できます。カレンダーの空き時間は連携後に確認します。"}
        それ以外の予定の内容はすぐに捨て、どこにも保存しません。
      </p>
      {lastImport && (
        <p className="pop-in mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-ink">
          {lastImport.scanned} 件の予定を確認 → ライブ <b>{lastImport.found}</b> 件を検出（新規登録 {lastImport.added} 件）
        </p>
      )}

      <ul className="mt-4 divide-y divide-line">
        {events.length === 0 && <li className="py-6 text-center text-sm text-mute">{importing ? "取り込み中…" : "まだイベントはありません"}</li>}
        {events.map((e, i) => {
          const active = e.id === event?.id;
          return (
            <li key={e.id} className="pop-in flex flex-wrap items-center gap-3 py-3.5" style={{ "--delay": `${i * 70}ms` } as CSSProperties}>
              <button onClick={() => selectEvent(e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={active}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-lg font-semibold ${active ? "bg-night text-white" : "bg-lav-50 text-lav-600"}`}>
                  {Number(e.startAt.slice(8, 10))}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-ink">{e.title}</span>
                    {e.source === "calendar" && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-lav-50 px-2 py-0.5 text-[10px] font-bold text-lav-600">
                        <GoogleG className="h-3 w-3" /> 自動取り込み
                      </span>
                    )}
                    {e.source === "scan" && <span className="shrink-0 rounded-full bg-lav-50 px-2 py-0.5 text-[10px] font-bold text-lav-600">スクショ・文章から</span>}
                    {active && <span className="shrink-0 rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-bold text-white">選択中</span>}
                  </span>
                  <span className="block truncate text-xs text-mute">
                    {e.artist} ・ {formatJst(e.startAt)}
                    {e.timeUnknown && "（時刻未定）"} ・ {e.venue}（{e.venueStation}）
                  </span>
                </span>
              </button>
              <button onClick={() => onEdit(e.id)} className={`min-h-[40px] rounded-lg px-3 text-xs font-bold ${editingId === e.id ? "bg-lav-100 text-lav-700" : "text-ink-soft hover:bg-lav-50"}`}>
                編集
              </button>
              <button onClick={() => { removeEvent(e.id); if (editingId === e.id) onEdit(null); }} className="grid h-10 w-10 place-items-center rounded-lg text-mute hover:bg-rose-50 hover:text-rose-500" aria-label={`${e.title} を削除`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <button onClick={() => onEdit(null)} className="mt-2 min-h-[44px] w-full rounded-xl border border-dashed border-lav-200 text-sm text-ink-soft hover:border-rose-300">
        ＋ 手動でイベントを追加
      </button>
    </section>
  );
}

function EventForm({ editing }: { editing: OshiEvent | null }) {
  const { saveEvent, generatePlan, busy, profile, setProfile } = useStore();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    artist: editing?.artist ?? "",
    title: editing?.title ?? "",
    venue: editing?.venue ?? "",
    venueStation: editing?.venueStation ?? "",
    date: editing?.startAt.slice(0, 10) ?? "",
    time: editing?.startAt.slice(11, 16) ?? "18:00",
    homeStation: editing?.homeStation ?? profile.homeStation,
    beautyServices: (editing?.beautyServices ?? profile.beautyServices) as BeautyService[],
    arriveEarlyForGoods: editing?.arriveEarlyForGoods ?? profile.arriveEarlyForGoods,
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const parsed = OshiEventSchema.safeParse({
      id: editing?.id ?? `manual-${Math.random().toString(36).slice(2, 10)}`,
      artist: form.artist,
      title: form.title,
      venue: form.venue,
      venueStation: form.venueStation || form.venue,
      startAt: `${form.date}T${form.time}:00+09:00`,
      homeStation: form.homeStation,
      beautyServices: form.beautyServices,
      arriveEarlyForGoods: form.arriveEarlyForGoods,
      source: editing?.source ?? "manual",
      timeUnknown: false,
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
    saveEvent(parsed.data);
    // 出発駅・美容メニューは次回以降の取り込みにも使う既定値として記憶（メモリ上のみ）
    setProfile({ homeStation: parsed.data.homeStation, beautyServices: parsed.data.beautyServices, arriveEarlyForGoods: parsed.data.arriveEarlyForGoods });
    return parsed.data;
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="event-form">
      <p className="font-display text-sm italic text-mute">{editing ? "Edit" : "New"}</p>
      <h2 id="event-form" className="text-[17px] font-bold text-ink">{editing ? `「${editing.title}」を編集` : "イベントを手動で追加"}</h2>
      {(editing?.source === "calendar" || editing?.source === "scan") && <p className="mt-1 text-xs text-mute">自動で読み取った内容です。違っていれば修正してください。</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <input
                className={field}
                value={form.venue}
                list="venue-list"
                placeholder="会場名を入力 / 候補から選択"
                onChange={(e) => {
                  const v = e.target.value;
                  const known = matchVenue(v);
                  setForm((f) => ({ ...f, venue: v, venueStation: known && known.name === v ? known.station : f.venueStation }));
                }}
                maxLength={60}
              />
              <datalist id="venue-list">
                {VENUES.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.area}・{v.station}駅
                  </option>
                ))}
              </datalist>
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              会場最寄り駅
              <input className={field} value={form.venueStation} onChange={(e) => set("venueStation", e.target.value)} maxLength={40} />
            </label>
            <label className="text-xs font-semibold text-ink-soft sm:col-span-2">
              出発駅（自宅最寄り・サロンもこの周辺で探します／全イベント共通）
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
  );
}

export default function EventsPage() {
  const { event, events, eventImage, setEventImage, persistImages } = useStore();
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  // 未指定なら選択中のイベントを編集、null なら新規追加
  const targetId = editingId === undefined ? (event?.id ?? null) : editingId;
  const editing = events.find((e) => e.id === targetId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xl italic text-mute">Events</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[28px]">イベント</h1>
        <p className="mt-1 text-sm text-ink-soft">Google カレンダーからライブを自動で取り込めます。取り込んだ内容は画面上部のティッカーやホームにすぐ反映されます。</p>
      </div>

      <RegisteredEvents editingId={targetId} onEdit={setEditingId} />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <EventForm key={editing?.id ?? "new"} editing={editing} />

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-[15px] font-bold text-ink">推し画像</h2>
            <p className="mt-1 text-xs text-mute">
              {event ? `${event.artist} ` : "選択中のアーティスト"}の推し画像として、同じアーティストのイベントすべてに表示されます。
              画像はサーバーに送信しません。{persistImages ? "このブラウザに保存されるので、次に開いたときも表示されます。" : "設定で「この端末に保存」をオンにすると、次に開いたときも表示されます。"}
            </p>
            <div className="relative mt-3 h-44 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {eventImage ? <img src={eventImage} alt="推し画像" className="kenburns h-full w-full object-cover" /> : <StageScene className="relative h-full w-full" crowd={18} />}
            </div>
            <div className="mt-3 flex gap-2">
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
                <button onClick={() => setEventImage(null)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-mute hover:text-ink">
                  <Trash2 className="h-4 w-4" /> 外す
                </button>
              )}
            </div>
          </section>


        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/components/store";
import { BEAUTY_LABEL, BEAUTY_SERVICES, EVENT_TEXT_LIMITS, OshiEventSchema, type BeautyService, type OshiEvent } from "@/lib/agent/types";
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
/** 開いているフォーム。"new"＝新規追加、イベントの id＝そのイベントの編集、null＝閉じている */
type FormTarget = "new" | string | null;

function RegisteredEvents({ formTarget, onOpen }: { formTarget: FormTarget; onOpen: (t: FormTarget) => void }) {
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
          {/* 連携していないときは押しても何も起きないので出さない */}
          {session?.calendarConnected && (
            <button onClick={() => void importFromCalendar()} disabled={busy !== null} className="btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold">
              {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {importing ? "探しています…" : "カレンダーから取り込む"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-mute">
        {session?.calendarConnected
          ? "今後 6 か月の予定から、ライブらしいものだけを登録します。ほかの予定はすぐに捨てて、どこにも保存しません。削除したライブは、次に取り込んでも戻ってきません。"
          : "スクショや文章、手入力でも登録できます。空き時間は、カレンダーをつないでから確かめます。"}
      </p>
      {lastImport && (
        <p className="pop-in mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-ink">
          予定 {lastImport.scanned} 件から、ライブが <b>{lastImport.found}</b> 件見つかりました。新しく登録したのは {lastImport.added} 件です。
        </p>
      )}

      <ul className="mt-4 divide-y divide-line">
        {events.length === 0 && <li className="py-6 text-center text-sm text-mute">{importing ? "取り込み中…" : "まだライブはありません"}</li>}
        {events.map((e, i) => {
          const active = e.id === event?.id;
          return (
            <li key={e.id} className="pop-in py-3.5" style={{ "--delay": `${i * 70}ms` } as CSSProperties}>
              <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => selectEvent(e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={active}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-lg font-semibold ${active ? "bg-night text-white" : "bg-lav-50 text-lav-600"}`}>
                  {Number(e.startAt.slice(8, 10))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-bold leading-snug text-ink [word-break:auto-phrase]">{e.title}</span>
                  <span className="block truncate text-xs text-mute">
                    {e.artist} ・ {formatJst(e.startAt)}
                    {e.timeUnknown && "（時刻未定）"} ・ {e.venue}（{e.venueStation}）
                  </span>
                  {/* 札は題名の下に並べる（狭い画面で題名が潰れないように） */}
                  {(e.source === "calendar" || e.source === "scan" || active) && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {e.source === "calendar" && (
                        <span className="flex items-center gap-1 rounded-full bg-lav-50 px-2 py-0.5 text-[10px] font-bold text-lav-600">
                          <GoogleG className="h-3 w-3" /> 自動取り込み
                        </span>
                      )}
                      {e.source === "scan" && <span className="rounded-full bg-lav-50 px-2 py-0.5 text-[10px] font-bold text-lav-600">スクショ・文章から</span>}
                      {active && <span className="rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-bold text-white">選択中</span>}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => onOpen(formTarget === e.id ? null : e.id)}
                aria-expanded={formTarget === e.id}
                className={`flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-bold ${formTarget === e.id ? "bg-lav-100 text-lav-700" : "text-ink-soft hover:bg-lav-50"}`}
              >
                <Pencil className="h-3.5 w-3.5" /> {formTarget === e.id ? "閉じる" : "編集"}
              </button>
              <button onClick={() => { removeEvent(e.id); if (formTarget === e.id) onOpen(null); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-mute hover:bg-rose-50 hover:text-rose-500" aria-label={`${e.title} を削除`}>
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
              {/* 編集は、そのイベントのすぐ下に開く */}
              {formTarget === e.id && <EventForm key={e.id} editing={e} onClose={() => onOpen(null)} />}
            </li>
          );
        })}
      </ul>
      {/* 新規追加は、このボタンの場所でそのまま開く */}
      {formTarget === "new" ? (
        <EventForm key="new" editing={null} onClose={events.length > 0 ? () => onOpen(null) : undefined} />
      ) : (
        <button onClick={() => onOpen("new")} className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-lav-200 text-sm text-ink-soft hover:border-rose-300 hover:bg-rose-50/40">
          <Plus className="h-4 w-4" /> ライブを手入力で追加
        </button>
      )}
    </section>
  );
}

function EventForm({ editing, onClose }: { editing: OshiEvent | null; onClose?: () => void }) {
  const { saveEvent, generatePlan, busy, profile, setProfile, aiReady, notify, autoPlan } = useStore();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    // 以前に保存した長すぎる値は、入力欄の上限に切ってから表示する（そのままだと保存できず、理由も分からないため）
    artist: (editing?.artist ?? "").slice(0, EVENT_TEXT_LIMITS.artist),
    title: (editing?.title ?? "").slice(0, EVENT_TEXT_LIMITS.title),
    venue: (editing?.venue ?? "").slice(0, EVENT_TEXT_LIMITS.venue),
    venueStation: (editing?.venueStation ?? "").slice(0, EVENT_TEXT_LIMITS.venueStation),
    date: editing?.startAt.slice(0, 10) ?? "",
    time: editing?.startAt.slice(11, 16) ?? "18:00",
    homeStation: editing?.homeStation ?? profile.homeStation,
    beautyServices: (editing?.beautyServices ?? profile.beautyServices) as BeautyService[],
    arriveEarlyForGoods: editing?.arriveEarlyForGoods ?? profile.arriveEarlyForGoods,
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  // 開いたら、フォームを見える位置に出して最初の欄にカーソルを置く（最初から開いているときは動かさない）
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onClose) return;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    // 開いたときだけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setErr("まだ入っていない欄があります");
      return null;
    }
    if (Date.parse(parsed.data.startAt) < Date.now()) {
      setErr("日時は、これから先の日付にしてください");
      return null;
    }
    setErr(null);
    saveEvent(parsed.data);
    // 出発駅（全イベント共通）と、美容メニュー・物販の希望を次に取り込むイベントの既定値として記憶
    setProfile({ homeStation: parsed.data.homeStation, beautyServices: parsed.data.beautyServices, arriveEarlyForGoods: parsed.data.arriveEarlyForGoods });
    onClose?.();
    return parsed.data;
  };

  return (
    <div ref={ref} className="pop-in mt-3 scroll-mt-16 rounded-2xl border border-lav-200 bg-lav-50/40 p-4 sm:p-5" role="group" aria-labelledby={`event-form-${editing?.id ?? "new"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm italic text-mute">{editing ? "Edit" : "New"}</p>
          <h3 id={`event-form-${editing?.id ?? "new"}`} className="text-[16px] font-bold text-ink">{editing ? `「${editing.title}」を編集` : "ライブを手入力で追加"}</h3>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="フォームを閉じる" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {(editing?.source === "calendar" || editing?.source === "scan") && <p className="mt-1 text-xs text-mute">自動で読み取った内容です。違うところがあれば直してください。</p>}
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
                placeholder="会場名を入れるか、候補から選ぶ"
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
              出発駅（全ライブ共通。サロンもこの近くで探します）
              <input className={field} value={form.homeStation} onChange={(e) => set("homeStation", e.target.value)} maxLength={40} />
            </label>
          </div>

          <fieldset className="mt-6">
            <legend className="text-xs font-semibold text-ink-soft">ライブ前に行きたい美容メニュー</legend>
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
            物販に並ぶので、早めに会場へ行きたい
          </label>

          {err && <p className="mt-4 text-sm text-rose-500">{err}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => {
                if (save()) notify(autoPlan ? "保存しました。準備プランを作り始めます" : "保存しました");
              }}
              className="rounded-xl border border-line px-6 py-3 text-sm font-semibold text-ink-soft hover:bg-lav-50"
            >
              保存
            </button>
            <button
              onClick={() => {
                const saved = save();
                if (!saved) return;
                // 先にプラン画面へ移り、作成の進み具合を見せる
                router.push("/plan");
                void generatePlan(saved);
              }}
              disabled={busy !== null}
              className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
            >
              {busy === "planning" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiReady ? "保存しておまかせで作る" : "保存してプランを作る"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mute">
            {autoPlan
              ? "どちらで保存しても、空き時間・美容・移動を調べて準備プランを作ります。予約は、あなたが承認するまで進みません。"
              : `いまは自動作成がオフです。「${aiReady ? "保存しておまかせで作る" : "保存してプランを作る"}」を押すと作ります。設定でオンにもできます。`}
          </p>
          {onClose && (
            <button type="button" onClick={onClose} className="mt-3 text-xs font-semibold text-ink-soft underline-offset-2 hover:underline">
              キャンセル
            </button>
          )}
    </div>
  );
}

export default function EventsPage() {
  const { events } = useStore();
  // 未操作のとき、イベントが 1 件もなければ新規追加のフォームを最初から開いておく
  const [target, setTarget] = useState<FormTarget | undefined>(undefined);
  const formTarget = target === undefined ? (events.length === 0 ? "new" : null) : target;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベント">
        Google カレンダーやスクショから、ライブを登録できます。登録したライブは、ホームと画面上部の帯にすぐ出ます。
      </PageHeader>

      <RegisteredEvents formTarget={formTarget} onOpen={setTarget} />
    </div>
  );
}

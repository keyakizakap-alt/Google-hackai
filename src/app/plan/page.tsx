"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, Bot, Check, ChevronRight, LoaderCircle, Lock, Send, ShieldCheck, Sparkles, TriangleAlert,
} from "lucide-react";
import { AgentConsole } from "@/components/AgentConsole";
import { AddToCalendarButton } from "@/components/Reminders";
import { ConflictBanner, DecisionsCard, WatchCard } from "@/components/AgentInsights";
import { isInAppBookable } from "@/lib/booking/eligible";
import { ItemIcon } from "@/components/icons";
import { StageScene } from "@/components/StageScene";
import { STATUS_LABEL } from "@/components/PlanSummary";
import { useStore } from "@/components/store";
import type { TimelineItem } from "@/lib/agent/types";
import { formatJst, relativeDayLabel } from "@/lib/time";

const FLOW = ["generating", "pending_approval", "approved", "booked"] as const;
const HISTORY_LABEL: Record<string, string> = {
  draft: "作成開始",
  generating: "AIが作成",
  pending_approval: "確認待ち",
  revising: "見直し",
  approved: "承認",
  rejected: "見送り",
  booking: "予約を実行",
  booked: "予約完了",
};
const FLOW_LABEL = ["提案", "あなたが確認", "承認", "予約"];

function StatusStepper({ status }: { status: string }) {
  const idx = status === "revising" ? 0 : status === "rejected" ? 1 : status === "booking" ? 3 : FLOW.indexOf(status as (typeof FLOW)[number]);
  return (
    <ol className="flex items-center gap-1 text-[11px] sm:gap-2 sm:text-xs" aria-label="プランの進行状況">
      {FLOW_LABEL.map((l, i) => (
        <li key={l} className="flex items-center gap-1 sm:gap-2">
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${i < idx || (status === "booked" && i === idx) ? "bg-lav-100 text-lav-700" : i === idx ? "bg-rose-400 text-white" : "bg-lav-50 text-mute"}`}>
            {(i < idx || (status === "booked" && i === idx)) && <Check className="h-3 w-3" />}
            {l}
          </span>
          {i < FLOW_LABEL.length - 1 && <span className="h-px w-3 bg-line sm:w-5" />}
        </li>
      ))}
    </ol>
  );
}

function ItemCard({ item, eventStart, selectable, checked, onToggle, index = 0 }: { item: TimelineItem; eventStart: string; selectable: boolean; checked: boolean; onToggle: () => void; index?: number }) {
  const highlight = item.kind === "event";
  return (
    <li className="pop-in relative grid grid-cols-1 gap-1.5 sm:grid-cols-[92px_1fr] sm:gap-5" style={{ "--delay": `${200 + index * 120}ms` } as CSSProperties}>
      <div className="flex items-baseline gap-2 px-1 sm:block sm:px-0 sm:pt-4 sm:text-right">
        <p className="font-display text-xl font-semibold leading-none text-ink">{relativeDayLabel(item.start, eventStart)}</p>
        <p className="text-[11px] text-mute">{formatJst(item.start, { date: true })}</p>
      </div>
      <div className={`card-lift relative rounded-2xl border p-3.5 transition sm:p-4 ${highlight ? "border-rose-100 bg-gradient-to-r from-rose-50 to-white" : "border-line bg-white"}`}>
        <span className="absolute -left-[17px] top-6 hidden h-3.5 w-3.5 rounded-full border-[3px] border-rose-300 bg-white sm:block" aria-hidden />
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${highlight ? "bg-rose-100 text-rose-500" : "bg-lav-50 text-lav-600"}`}>
            <ItemIcon item={item} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[15px] font-bold text-ink">{item.title}</p>
              <p className="text-xs text-ink-soft">
                {formatJst(item.start, { time: true })}〜{formatJst(item.end, { time: true })}
              </p>
            </div>
            {(item.provider || item.location) && (
              <p className="mt-1 text-xs text-ink-soft">
                {item.provider?.name}
                {item.provider?.priceJpy !== undefined && ` ・ ¥${item.provider.priceJpy.toLocaleString()}`}
                {item.location && ` ・ ${item.location}`}
              </p>
            )}
            {item.route && (
              <div className="mt-2 rounded-xl bg-lav-50/70 px-3 py-2 text-xs text-ink-soft">
                <p className="font-semibold text-ink">
                  {item.route.from} → {item.route.to}
                  {item.route.fareJpy !== undefined && <span className="ml-2 font-normal">約 ¥{item.route.fareJpy.toLocaleString()}</span>}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${item.route.source === "ekispert" ? "bg-lav-200 text-lav-700" : "bg-white text-mute"}`}>
                    {item.route.source === "ekispert" ? "乗換案内" : "目安"}
                  </span>
                </p>
                {item.route.legs.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {item.route.legs.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-11 shrink-0 tabular-nums text-mute">
                          {l.departure && Number.isFinite(Date.parse(l.departure)) ? formatJst(l.departure, { time: true }) : (l.departure ?? "")}
                        </span>
                        <span>
                          {l.from} → {l.to}（{l.line}）
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">{item.route.summary}</p>
                )}
              </div>
            )}
            <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-ink-soft">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              {item.rationale}
            </p>
          </div>
          {item.requiresBooking && (
            <label className={`flex shrink-0 cursor-pointer flex-col items-center gap-1 text-[10px] ${selectable ? "text-lav-700" : "text-mute"}`}>
              <input type="checkbox" className="h-5 w-5 accent-[#655da3]" checked={checked} disabled={!selectable} onChange={onToggle} aria-label={`${item.title} を予約対象にする`} />
              予約
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

function RevisePanel() {
  const { chat, busy, revisePlan, envelope } = useStore();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [chat.length]);
  const canRevise = Boolean(envelope && ["pending_approval", "approved", "rejected"].includes(envelope.status));
  const suggestions = ["ヘアカットは4日前にしたい", "物販はなし、開演1時間前着で", "サロンは土日の午前がいい"];
  const submit = async (t: string) => {
    if (!t.trim() || !canRevise) return;
    setText("");
    await revisePlan(t.trim());
  };
  return (
    <section className="card flex flex-col p-5" aria-labelledby="revise">
      <h2 id="revise" className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <Bot className="h-5 w-5 text-lav-600" />
        AIに相談して直す
      </h2>
      <p className="mt-1 text-xs text-mute">AI への要望はここから。修正後も必ずあなたの承認待ちに戻ります。</p>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                m.role === "user" ? "rounded-br-sm bg-lav-600 text-white" : m.role === "agent" ? "rounded-bl-sm bg-lav-50 text-ink" : "bg-rose-50 text-rose-500"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {busy === "revising" && (
          <p className="flex items-center gap-2 text-xs text-mute">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> AIが組み直しています…
          </p>
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => void submit(s)}
            disabled={!canRevise || busy !== null}
            className="rounded-full border border-line bg-white px-3 py-1 text-[11px] text-ink-soft hover:border-lav-400 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={canRevise ? "例: 眉毛サロンは土曜の午前がいい" : "予約完了後は修正できません"}
          disabled={!canRevise || busy !== null}
          className="min-w-0 flex-1 rounded-xl border border-line bg-cloud px-3 py-2.5 text-sm outline-none focus:border-lav-400 focus:bg-white"
          aria-label="AIへの相談内容"
        />
        <button type="submit" disabled={!canRevise || busy !== null || !text.trim()} className="btn-primary grid w-11 place-items-center rounded-xl text-white" aria-label="送信">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function TracePanel() {
  const { trace, envelope } = useStore();
  if (!trace.length) return null;
  return (
    <section aria-labelledby="trace" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Activity className="h-4 w-4 text-lav-600" />
        <h2 id="trace" className="text-sm font-bold text-ink">{envelope?.plan.generatedBy.engine === "gemini" ? "AI が調べたこと" : "確認したこと"}</h2>
        <span className="ml-auto text-[11px] text-mute">予定の中身や画像は記録していません</span>
      </div>
      <AgentConsole key={`${envelope?.plan.id}-${envelope?.plan.revision}`} running={false} trace={trace} agentic={envelope?.plan.generatedBy.engine === "gemini"} />
      {envelope && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pt-1 text-[11px] text-mute" aria-label="これまでの流れ">
          {envelope.history.map((h, i) => (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>→</span>}
              <span>
                {formatJst(h.at, { time: true })} {HISTORY_LABEL[h.status] ?? h.status}
                <span className="text-lav-400">（{h.actor === "user" ? "あなた" : h.actor === "agent" ? "AI" : "アプリ"}）</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ApprovalPanel({ selected }: { selected: Set<string> }) {
  const { envelope, busy, approve, reject, book, session } = useStore();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const inApp = session?.booking?.inApp ?? false;
  const demo = session?.booking?.demo ?? false;
  if (!envelope) return null;
  const { plan, status } = envelope;
  const selectedItems = plan.items.filter((i) => (status === "pending_approval" ? selected.has(i.id) : envelope.approvedItemIds.includes(i.id)));
  const priced = selectedItems.filter((i) => (i.provider?.priceJpy ?? i.route?.fareJpy) !== undefined);
  const total = priced.reduce((a, i) => a + (i.provider?.priceJpy ?? i.route?.fareJpy ?? 0), 0);
  const inAppCount = inApp ? selectedItems.filter(isInAppBookable).length : 0;
  const guideCount = selectedItems.length - inAppCount;

  return (
    <section className="card p-5" aria-labelledby="approval">
      <h2 id="approval" className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <ShieldCheck className="h-5 w-5 text-lav-600" />
        承認と予約
      </h2>
      <div className="mt-3 rounded-xl bg-lav-50/70 p-3 text-xs leading-relaxed text-ink-soft">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <Lock className="h-3.5 w-3.5" /> あなたが承認して「予約する」を押すまで、予約は一切行われません。
        </p>
        <p className="mt-1">AI は提案するだけで、勝手に予約・キャンセル・支払いをすることはありません。</p>
        {inApp && demo && <p className="mt-1 font-semibold text-rose-500">いまはデモ予約です。予約番号は発行されますが、実在の店舗・交通機関・宿には届きません。</p>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-ink-soft">予約対象</dt>
        <dd className="text-right font-bold text-ink">{selectedItems.length} 件</dd>
        <dt className="text-ink-soft">目安合計</dt>
        <dd className="text-right font-bold text-ink">
          {priced.length === 0 ? <span className="text-xs font-normal text-mute">料金は未確認</span> : `¥${total.toLocaleString()}${priced.length < selectedItems.length ? "〜" : ""}`}
        </dd>
      </dl>

      {status === "pending_approval" && (
        <div className="mt-4 grid gap-2">
          <button
            onClick={() => void approve([...selected])}
            disabled={busy !== null}
            className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
          >
            {busy === "approving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {selected.size === 0 ? "予約なしで承認する" : `このプランを承認する（予約 ${selectedItems.length} 件）`}
          </button>
          <button onClick={() => void reject()} disabled={busy !== null} className="rounded-xl border border-line py-2.5 text-sm text-ink-soft hover:bg-lav-50">
            今回は見送る
          </button>
        </div>
      )}

      {status === "approved" && (
        <div className="mt-4 grid gap-2">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy !== null || selectedItems.length === 0}
              className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
            >
              {inApp ? "予約へ進む" : "予約の手続きへ進む"} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-xs leading-relaxed text-ink">
                {inAppCount > 0
                  ? `${inAppCount} 件をアプリ内で予約します${demo ? "（デモ予約：実在の店舗には届きません）" : ""}。予約後は「予約の管理」からキャンセルでき、前日と 2 時間前にリマインドします。支払いは発生しません。`
                  : ""}
                {guideCount > 0 ? `${inAppCount > 0 ? "残りの " : ""}${guideCount} 件は予約ではなく確認が必要なもので、「予約の管理」に案内サイトと一緒に追加します。` : ""}
              </p>
              <ul className="mt-2 list-inside list-disc text-xs text-ink-soft">
                {selectedItems.map((i) => (
                  <li key={i.id}>
                    {i.title}
                    <span className="ml-1 text-[10px] text-mute">{inApp && isInAppBookable(i) ? "（アプリ内で予約）" : "（案内のみ）"}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setConfirming(false)} className="rounded-lg border border-line bg-white py-2 text-xs">
                  戻る
                </button>
                <button
                  onClick={async () => {
                    if (await book()) router.push("/bookings");
                  }}
                  disabled={busy !== null}
                  className="btn-primary flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-white"
                >
                  {busy === "booking" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {inAppCount > 0 ? `${inAppCount} 件を予約する` : "予約リストに追加する"}
                </button>
              </div>
            </div>
          )}
          {selectedItems.length === 0 && <p className="text-[11px] text-mute">予約なしで承認しました。予約したいものがあれば「AIに相談して直す」で見直すと、もう一度選べます。</p>}
        </div>
      )}
      {status === "rejected" && <p className="mt-4 text-xs text-ink-soft">このプランは見送りました。「AIに相談して直す」から作り直せます。</p>}
      {status === "booked" && (
        <div className="mt-4 grid gap-2">
          <button onClick={() => router.push("/bookings")} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white">
            予約の管理を開く <ChevronRight className="h-4 w-4" />
          </button>
          <AddToCalendarButton className="min-h-[44px] w-full rounded-xl border border-line text-xs font-bold text-ink hover:bg-lav-50" />
        </div>
      )}
      {status === "approved" && <AddToCalendarButton className="mt-2 min-h-[40px] w-full rounded-xl text-xs font-bold text-ink-soft hover:bg-lav-50" />}
    </section>
  );
}

function EmptyPlan() {
  const { busy, generatePlan, event, availability, planError, aiReady } = useStore();
  const planning = busy === "planning";
  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xl italic text-mute">Countdown Plan</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[32px]">推し活プラン</h1>
      </div>
      <div className="grid overflow-hidden rounded-[22px] bg-night text-white shadow-float lg:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-[260px]">
          <StageScene className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-night/70" />
        </div>
        <div className="relative flex flex-col justify-center p-7 sm:p-10">
          <p className="text-[10px] font-bold tracking-[0.3em] text-white/50">{aiReady ? "AI PLANNER" : "PLANNER"}</p>
          <p className="mt-2 text-2xl font-bold leading-snug">
            {event ? event.title : "イベントが未登録です"}
            <span className="block text-base font-medium text-white/70">{event ? "に向けたプランを逆算します" : "先にイベントを登録してください"}</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            空き時間・美容のベストなタイミング・混雑を避けたルートを{aiReady ? " AI が調べて" : "決まった目安にそって"}、スケジュールを提案します。予約はあなたが確認してからです。
            {!availability && "（空き時間はプラン作成時に自動で確認します）"}
          </p>
          {planError && !planning && event && (
            <p className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-rose-200" role="alert">
              プランを作れませんでした：{planError}
            </p>
          )}
          {planning ? (
            <div className="mt-6">
              <AgentConsole running label={aiReady ? undefined : "プランを組み立てています…"} />
              <p className="mt-2 text-[11px] text-white/50">{aiReady ? "AI が調べものをしながら作るため、30 秒〜1 分ほどかかります。" : "数秒で完成します。"}</p>
            </div>
          ) : !event ? (
            <Link href="/events" className="btn-primary mt-7 flex w-fit items-center gap-2 rounded-xl px-8 py-4 text-[15px] font-bold ring-1 ring-white/20">
              イベントを登録する
            </Link>
          ) : (
            <button onClick={() => void generatePlan()} disabled={busy !== null} className="btn-primary mt-7 flex w-fit items-center gap-2 rounded-xl px-8 py-4 text-[15px] font-bold ring-1 ring-white/20">
              <Sparkles className="h-5 w-5" />
              {planError ? "もう一度作る" : aiReady ? "AI にプランを作ってもらう" : "プランを作る"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const { envelope, busy } = useStore();
  const bookableKey = envelope ? `${envelope.plan.id}:${envelope.plan.revision}` : "";
  const bookable = useMemo(() => envelope?.plan.items.filter((i) => i.requiresBooking).map((i) => i.id) ?? [], [bookableKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  // プランが差し替わったら「予約が必要な項目」を初期選択に戻す
  const selected = selection.key === bookableKey ? selection.ids : new Set(bookable);

  if (!envelope) return <EmptyPlan />;

  const { plan, status } = envelope;
  const isPending = status === "pending_approval";
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelection({ key: bookableKey, ids: n });
  };

  return (
    <div className="space-y-5 px-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-lg italic text-mute">Countdown Plan</p>
          <p className="text-xs text-mute">
            {plan.revision === 0 ? "最初の提案" : `${plan.revision}回目の見直し`} ・ {STATUS_LABEL[status]} ・{" "}
            {plan.generatedBy.engine === "gemini" ? "AI が作成" : "かんたん提案で作成"}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[28px]">{plan.event.title} への準備プラン</h1>
        </div>
        <StatusStepper status={status} />
      </div>

      <ConflictBanner />
      <WatchCard />

      {isPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-ink" role="status">
          <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-400" />
          <p>
            <b>あなたの確認待ち</b> — 内容を見て、予約したいものにチェックを入れて承認してください。気になるところは「AIに相談して直す」から伝えられます。
          </p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <section className="card p-5">
            <p className="text-[15px] leading-relaxed text-ink">{plan.summary}</p>
            {plan.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {plan.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-soft">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DecisionsCard decisions={plan.decisions} agentic={plan.generatedBy.engine === "gemini"} />

          <section className="card p-4 sm:p-6" aria-label="タイムライン">
            <ol className="relative space-y-4">
              <span key={bookableKey} className="draw-line absolute bottom-4 left-[102px] top-4 hidden w-[2px] rounded bg-gradient-to-b from-rose-300 via-lav-200 to-rose-300 sm:block" aria-hidden />
              {plan.items.map((it, idx) => (
                <ItemCard
                  key={`${bookableKey}-${it.id}`}
                  index={idx}
                  item={it}
                  eventStart={plan.event.startAt}
                  selectable={isPending && busy === null}
                  checked={isPending ? selected.has(it.id) : envelope.approvedItemIds.includes(it.id)}
                  onToggle={() => toggle(it.id)}
                />
              ))}
            </ol>
          </section>
          <TracePanel />
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <ApprovalPanel selected={selected} />
          <RevisePanel />
        </div>
      </div>
    </div>
  );
}

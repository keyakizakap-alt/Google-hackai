"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, Bot, Check, ChevronRight, LoaderCircle, Lock, Send, ShieldCheck, Sparkles, TriangleAlert,
} from "lucide-react";
import { AgentConsole } from "@/components/AgentConsole";
import { ItemIcon } from "@/components/icons";
import { StageScene } from "@/components/StageScene";
import { STATUS_LABEL } from "@/components/PlanSummary";
import { useStore } from "@/components/store";
import type { TimelineItem } from "@/lib/agent/types";
import { formatJst, relativeDayLabel } from "@/lib/time";

const FLOW = ["generating", "pending_approval", "approved", "booked"] as const;
const FLOW_LABEL = ["AIが作成", "あなたが確認", "承認", "予約"];

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
                    {item.route.source === "ekispert" ? "駅すぱあと" : "概算"}
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
        修正指示
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
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> エージェントが組み直しています…
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
          aria-label="修正指示"
        />
        <button type="submit" disabled={!canRevise || busy !== null || !text.trim()} className="btn-primary grid w-11 place-items-center rounded-xl text-white" aria-label="送信">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function TracePanel() {
  const { trace, usage, engine, envelope } = useStore();
  if (!trace.length) return null;
  return (
    <section aria-labelledby="trace" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Activity className="h-4 w-4 text-lav-600" />
        <h2 id="trace" className="text-sm font-bold text-ink">エージェントの行動ログ</h2>
        <span className="ml-auto text-[11px] text-mute">
          {engine === "gemini" ? envelope?.plan.generatedBy.model : "ルールベース"}
          {usage && usage.totalTokens > 0 && ` ・ ${usage.totalTokens.toLocaleString()} tokens`} ・ 予定の内容や画像は含みません
        </span>
      </div>
      <AgentConsole key={`${envelope?.plan.id}-${envelope?.plan.revision}`} running={false} trace={trace} />
    </section>
  );
}

function ApprovalPanel({ selected }: { selected: Set<string> }) {
  const { envelope, busy, approve, reject, book } = useStore();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!envelope) return null;
  const { plan, status } = envelope;
  const selectedItems = plan.items.filter((i) => (status === "pending_approval" ? selected.has(i.id) : envelope.approvedItemIds.includes(i.id)));
  const total = selectedItems.reduce((a, i) => a + (i.provider?.priceJpy ?? i.route?.fareJpy ?? 0), 0);

  return (
    <section className="card p-5" aria-labelledby="approval">
      <h2 id="approval" className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <ShieldCheck className="h-5 w-5 text-lav-600" />
        承認と予約
      </h2>
      <div className="mt-3 rounded-xl bg-lav-50/70 p-3 text-xs leading-relaxed text-ink-soft">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <Lock className="h-3.5 w-3.5" /> あなたが承認するまで、予約・決済は一切行われません。
        </p>
        <p className="mt-1">AI は提案のみを行い、予約系の操作権限を持っていません。</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-ink-soft">予約対象</dt>
        <dd className="text-right font-bold text-ink">{selectedItems.length} 件</dd>
        <dt className="text-ink-soft">目安合計</dt>
        <dd className="text-right font-bold text-ink">¥{total.toLocaleString()}</dd>
      </dl>

      {status === "pending_approval" && (
        <div className="mt-4 grid gap-2">
          <button
            onClick={() => void approve([...selected])}
            disabled={busy !== null}
            className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
          >
            {busy === "approving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            このプランを承認する
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
              承認済み：予約へ進む <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-xs text-ink">以下の {selectedItems.length} 件の予約手続きを実行します。よろしいですか？</p>
              <ul className="mt-2 list-inside list-disc text-xs text-ink-soft">
                {selectedItems.map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setConfirming(false)} className="rounded-lg border border-line bg-white py-2 text-xs">
                  戻る
                </button>
                <button
                  onClick={async () => {
                    await book();
                    router.push("/bookings");
                  }}
                  disabled={busy !== null}
                  className="btn-primary flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold text-white"
                >
                  {busy === "booking" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  予約を確定する
                </button>
              </div>
            </div>
          )}
          {selectedItems.length === 0 && <p className="text-[11px] text-mute">予約対象が選択されていません。修正指示から再提案できます。</p>}
        </div>
      )}
      {status === "rejected" && <p className="mt-4 text-xs text-ink-soft">このプランは見送りました。修正指示を送ると再提案します。</p>}
      {status === "booked" && (
        <button onClick={() => router.push("/bookings")} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white">
          予約内容を見る <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

function EmptyPlan() {
  const { busy, generatePlan, event, availability } = useStore();
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
          <p className="text-[10px] font-bold tracking-[0.3em] text-white/50">AI AGENT</p>
          <p className="mt-2 text-2xl font-bold leading-snug">
            {event ? event.title : "イベントが未登録です"}
            <span className="block text-base font-medium text-white/70">{event ? "に向けたプランを逆算します" : "先にイベントを登録してください"}</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            空き時間・美容の最適タイミング・混雑を避けた経路をエージェントが自分で調べ、承認待ちのタイムラインとして提案します。
            {!availability && "（空き時間はプラン作成時に自動で確認します）"}
          </p>
          {planning ? (
            <div className="mt-6">
              <AgentConsole running />
            </div>
          ) : !event ? (
            <Link href="/events" className="btn-primary mt-7 flex w-fit items-center gap-2 rounded-xl px-8 py-4 text-[15px] font-bold ring-1 ring-white/20">
              イベントを登録する
            </Link>
          ) : (
            <button onClick={() => void generatePlan()} disabled={busy !== null} className="btn-primary mt-7 flex w-fit items-center gap-2 rounded-xl px-8 py-4 text-[15px] font-bold ring-1 ring-white/20">
              <Sparkles className="h-5 w-5" />
              AI にプランを作ってもらう
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
          <p className="font-display text-lg italic text-mute">Countdown Plan · rev.{plan.revision}</p>
          <p className="text-xs text-mute">
            改訂 {plan.revision} ・ {plan.generatedBy.engine === "gemini" ? `Gemini (${plan.generatedBy.model})` : "ルールベース"} ・ {STATUS_LABEL[status]}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[28px]">{plan.event.title} への準備プラン</h1>
        </div>
        <StatusStepper status={status} />
      </div>

      {isPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-ink" role="status">
          <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-400" />
          <p>
            <b>承認待ち（pending_approval）</b> — 内容を確認し、予約したい項目にチェックを入れて承認してください。気になる点は修正指示で AI に伝えられます。
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

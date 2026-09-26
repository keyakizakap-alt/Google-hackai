"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { CircleCheck, ExternalLink, Info, RotateCcw, Trash2, XCircle } from "lucide-react";
import { ItemIcon } from "@/components/icons";
import { useStore, type Reservation, type ReservationStatus } from "@/components/store";
import { formatJst } from "@/lib/time";

const STATUS: Record<ReservationStatus, { label: string; tone: string }> = {
  todo: { label: "手続き前", tone: "bg-rose-50 text-rose-500" },
  reserved: { label: "予約済み", tone: "bg-lav-100 text-lav-700" },
  cancelled: { label: "キャンセル済み", tone: "bg-cloud text-mute" },
};

const FILTERS: { id: "all" | ReservationStatus; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "todo", label: "手続き前" },
  { id: "reserved", label: "予約済み" },
  { id: "cancelled", label: "キャンセル済み" },
];

function ReservationCard({ r, index }: { r: Reservation; index: number }) {
  const { updateReservation, removeReservation } = useStore();
  const [mode, setMode] = useState<"view" | "reserve" | "cancel">("view");
  const [no, setNo] = useState(r.confirmationNo ?? "");
  const [memo, setMemo] = useState(r.memo ?? "");
  const st = STATUS[r.status];

  return (
    <li className={`card pop-in p-5 ${r.status === "cancelled" ? "opacity-70" : ""}`} style={{ "--delay": `${index * 60}ms` } as CSSProperties}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${r.status === "reserved" ? "bg-night text-white" : "bg-lav-50 text-lav-600"}`}>
          <ItemIcon item={{ kind: r.kind, category: r.category }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[15px] font-bold text-ink ${r.status === "cancelled" ? "line-through" : ""}`}>{r.title}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {formatJst(r.start)}〜{formatJst(r.end, { time: true })}
            {r.place && ` ・ ${r.place}`}
            {r.priceJpy !== undefined && ` ・ 目安 ¥${r.priceJpy.toLocaleString()}`}
          </p>
          {r.status === "reserved" && r.confirmationNo && <p className="mt-1 text-xs font-bold text-lav-700">予約番号：{r.confirmationNo}</p>}
          {r.memo && <p className="mt-1 text-xs text-mute">メモ：{r.memo}</p>}
          {r.status === "todo" && <p className="mt-1 text-[11px] text-mute">{r.note}</p>}
        </div>
      </div>

      {mode === "view" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {r.url && r.status !== "cancelled" && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-primary flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold">
              {r.status === "reserved" ? "予約内容を確認・変更" : "予約サイトを開く"} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {r.status === "todo" && (
            <button onClick={() => setMode("reserve")} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line px-4 text-xs font-bold text-ink hover:bg-lav-50">
              <CircleCheck className="h-4 w-4 text-lav-600" /> 予約できた
            </button>
          )}
          {r.status === "reserved" && (
            <>
              <button onClick={() => setMode("reserve")} className="min-h-[44px] rounded-xl border border-line px-4 text-xs font-bold text-ink-soft hover:bg-lav-50">
                予約番号・メモを編集
              </button>
              <button onClick={() => setMode("cancel")} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line px-4 text-xs font-bold text-rose-500 hover:bg-rose-50">
                <XCircle className="h-4 w-4" /> キャンセルする
              </button>
            </>
          )}
          {r.status === "cancelled" && (
            <button onClick={() => updateReservation(r.id, { status: "todo" })} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line px-4 text-xs font-bold text-ink-soft hover:bg-lav-50">
              <RotateCcw className="h-4 w-4" /> 手続き前に戻す
            </button>
          )}
          <button onClick={() => removeReservation(r.id)} className="ml-auto grid h-11 w-11 place-items-center rounded-xl text-mute hover:bg-rose-50 hover:text-rose-500" aria-label={`${r.title} をリストから削除`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode === "reserve" && (
        <form
          className="pop-in mt-4 grid gap-3 rounded-2xl bg-cloud p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            updateReservation(r.id, { status: "reserved", confirmationNo: no.trim() || undefined, memo: memo.trim() || undefined });
            setMode("view");
          }}
        >
          <label className="text-xs font-semibold text-ink-soft">
            予約番号（任意）
            <input value={no} onChange={(e) => setNo(e.target.value)} maxLength={40} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-lav-400" placeholder="例: ABC-12345" />
          </label>
          <label className="text-xs font-semibold text-ink-soft">
            メモ（任意）
            <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-lav-400" placeholder="例: 当日は5分前に到着" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => setMode("view")} className="min-h-[44px] flex-1 rounded-xl border border-line bg-white text-xs">
              戻る
            </button>
            <button type="submit" className="btn-primary min-h-[44px] flex-1 rounded-xl text-xs font-bold">
              予約済みにする
            </button>
          </div>
        </form>
      )}

      {mode === "cancel" && (
        <div className="pop-in mt-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
          <p className="text-xs leading-relaxed text-ink">
            キャンセルは予約したサイトで手続きしてください。サイトでキャンセルが完了したら「キャンセルした」を押すと、ここに記録されます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.url && (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-xs font-bold text-ink">
                予約サイトでキャンセル <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button onClick={() => setMode("view")} className="min-h-[44px] rounded-xl border border-line bg-white px-4 text-xs">
              やめる
            </button>
            <button
              onClick={() => {
                updateReservation(r.id, { status: "cancelled" });
                setMode("view");
              }}
              className="min-h-[44px] rounded-xl bg-rose-500 px-4 text-xs font-bold text-white hover:brightness-105"
            >
              キャンセルした
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function BookingsPage() {
  const { reservations } = useStore();
  const [filter, setFilter] = useState<"all" | ReservationStatus>("all");
  const count = (s: ReservationStatus) => reservations.filter((r) => r.status === s).length;
  const list = reservations.filter((r) => filter === "all" || r.status === filter);
  const groups = [...new Set(list.map((r) => r.eventId))].map((id) => ({ id, title: list.find((r) => r.eventId === id)!.eventTitle, items: list.filter((r) => r.eventId === id) }));

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xl italic text-mute">Reservations</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[28px]">予約の管理</h1>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-lav-50 px-4 py-3 text-xs leading-relaxed text-ink-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-lav-600" />
        <p>
          OshiReady が代わりに予約・支払いをすることはありません。「予約サイトを開く」から各サイトで予約し、終わったら「予約できた」を押して記録してください。
          キャンセルも予約したサイトで行い、ここで状況を管理できます。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["todo", "reserved", "cancelled"] as const).map((s) => (
          <div key={s} className="card p-4 text-center">
            <p className="font-display text-4xl font-semibold text-ink">{count(s)}</p>
            <p className="text-[11px] font-bold text-mute">{STATUS[s].label}</p>
          </div>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="絞り込み">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-[44px] shrink-0 rounded-full px-5 text-sm transition ${filter === f.id ? "bg-night font-bold text-white" : "border border-line bg-white text-ink-soft hover:border-rose-300"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {reservations.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <p className="font-display text-4xl italic text-lav-200">No reservations</p>
          <p className="mt-3 font-bold text-ink">まだ予約はありません</p>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">プランを確認して承認すると、予約が必要なもの（サロン・新幹線・宿泊など）がここに並びます。</p>
          <Link href="/plan" className="btn-primary mt-6 rounded-xl px-6 py-3 text-sm font-bold">
            プランを確認する
          </Link>
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-mute">この条件に当てはまる予約はありません</p>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-label={g.title} className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-ink">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              {g.title}
            </h2>
            <ul className="grid gap-4 lg:grid-cols-2">
              {g.items.map((r, i) => (
                <ReservationCard key={r.id} r={r} index={i} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

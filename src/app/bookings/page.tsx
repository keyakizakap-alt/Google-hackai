"use client";

import Link from "next/link";
import { CircleCheck, ExternalLink, Lock, MapPin } from "lucide-react";
import { useStore } from "@/components/store";
import { formatJst } from "@/lib/time";

export default function BookingsPage() {
  const { bookings, envelope } = useStore();
  const history = envelope?.history ?? [];

  return (
    <div className="space-y-5 px-1">
      <div>
        <h1 className="text-xl font-bold text-ink">予約</h1>
        <p className="mt-1 text-sm text-ink-soft">あなたが承認した項目だけが、ここで予約手続きされます。</p>
      </div>

      {bookings.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-lav-50 text-lav-600">
            <Lock className="h-6 w-6" strokeWidth={1.6} />
          </span>
          <p className="mt-4 font-bold text-ink">まだ予約はありません</p>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">プランを確認・承認すると、ここに予約結果と外部サイトへのリンクが表示されます。</p>
          <Link href="/plan" className="btn-primary mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white">
            プランを確認する
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {bookings.map((b) => (
            <li key={b.itemId} className="card p-5">
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${b.status === "reserved" ? "bg-lav-100 text-lav-600" : "bg-rose-50 text-rose-500"}`}>
                  {b.status === "reserved" ? <CircleCheck className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{b.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {b.status === "reserved" ? `仮予約済み ・ 予約番号 ${b.confirmationCode}` : "外部サイトでの手続きが必要です"}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-mute">{b.note}</p>
                  {b.externalUrl && (
                    <a href={b.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-lav-600 hover:underline">
                      予約サイトを開く <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[15px] font-bold text-ink">承認の記録（監査ログ）</h2>
          <p className="mt-1 text-[11px] text-mute">プランは署名付きで管理され、改ざん・承認の省略はサーバーで拒否されます。</p>
          <ol className="mt-3 space-y-1 text-xs text-ink-soft">
            {history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums text-mute">{formatJst(h.at)}</span>
                <code className="rounded bg-lav-50 px-1.5 text-lav-700">{h.status}</code>
                <span>{h.actor === "user" ? "あなた" : h.actor === "agent" ? "AI エージェント" : "システム"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

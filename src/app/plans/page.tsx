"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, ChevronRight, LoaderCircle, Plane, Search, Sparkles, TrainFront } from "lucide-react";
import { useNow } from "@/components/motion";
import { STATUS_LABEL } from "@/components/PlanSummary";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/components/store";
import type { OshiEvent, PlanEnvelope } from "@/lib/agent/types";
import { formatJst, jstDayDiff } from "@/lib/time";

/** 状態ごとの札の色（承認待ちは目立たせる） */
const STATUS_TONE: Record<string, string> = {
  pending_approval: "bg-rose-400 text-white",
  approved: "bg-lav-100 text-lav-700",
  booked: "bg-lav-600 text-white",
  rejected: "bg-lav-50 text-mute",
};

/**
 * プラン一覧：登録したライブごとに、最新の準備プランを並べる。
 * プランはこの端末に保存したもの（承認待ちは 2 時間で期限切れになり、ここからも消える）。
 */
export default function PlansPage() {
  const { events, plans } = useStore();
  const now = useNow();
  // 終演の目安（開演 6 時間後）を過ぎたら「終わったライブ」にする
  const isPast = (e: OshiEvent) => now !== null && Date.parse(e.startAt) < now - 6 * 3_600_000;
  const upcoming = events.filter((e) => !isPast(e));
  const past = events.filter(isPast).reverse();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My Plans" title="プラン一覧">
        ライブごとに、準備プランをまとめて見られます。開くと、内容の確認・承認・予約に進めます。
      </PageHeader>

      {events.length === 0 ? (
        <section className="card p-7 text-center">
          <p className="text-sm text-ink-soft">まだライブが登録されていません。</p>
          <Link href="/events" className="btn-primary mx-auto mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white">
            ライブを登録する
            <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      ) : (
        <>
          <PlanGroup title="これからのライブ" events={upcoming} plans={plans} empty="これからのライブはありません。" />
          {past.length > 0 && <PlanGroup title="終わったライブ" events={past} plans={plans} muted />}
        </>
      )}
    </div>
  );
}

function PlanGroup({ title, events, plans, empty, muted = false }: { title: string; events: OshiEvent[]; plans: Record<string, PlanEnvelope>; empty?: string; muted?: boolean }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-[15px] font-bold text-ink">
        {title}
        <span className="ml-2 text-xs font-normal text-mute">{events.length} 件</span>
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-mute">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          {events.map((e) => (
            <PlanRow key={e.id} event={e} envelope={plans[e.id]} muted={muted} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanRow({ event, envelope: saved, muted }: { event: OshiEvent; envelope?: PlanEnvelope; muted: boolean }) {
  const router = useRouter();
  const { selectEvent, generatePlan, busy, event: active } = useStore();
  const now = useNow();
  // 期限（2 時間）が切れた承認待ちのプランは、承認できないので「未作成」として扱う（端末からは 1 分ごとに外す）
  const envelope = saved && (now === null || Date.parse(saved.expiresAt) > now || saved.status === "approved" || saved.status === "booked") ? saved : undefined;
  const planning = busy === "planning" && active?.id === event.id;
  const plan = envelope?.plan;
  const items = plan?.items ?? [];
  const count = (pred: (i: (typeof items)[number]) => boolean) => items.filter(pred).length;
  const beauty = count((i) => i.kind === "beauty");
  const isFlight = (i: (typeof items)[number]) => i.kind === "transit" && (i.category === "flight" || i.route?.source === "web" || /(：|^)飛行機で/.test(i.route?.summary ?? ""));
  const flights = count(isFlight);
  const transit = count((i) => i.kind === "transit" && !isFlight(i));
  const stay = count((i) => i.kind === "stay");
  // これから先で、いちばん近い準備（本番以外）
  const next = now === null || muted ? undefined : items.find((i) => i.kind !== "event" && Date.parse(i.start) > now);
  const daysLeft = now === null ? null : jstDayDiff(event.startAt, now);

  const open = () => {
    selectEvent(event.id);
    router.push("/plan");
  };
  const create = () => {
    selectEvent(event.id);
    router.push("/plan");
    void generatePlan(event);
  };

  return (
    <li className={`card card-lift flex gap-4 p-4 sm:p-5 ${muted ? "opacity-70" : ""}`}>
      <div className="w-14 shrink-0 text-center">
        <p className="font-display text-2xl font-semibold leading-none text-ink">{formatJst(event.startAt, { date: true }).replace(/\s*\(.+\)$/, "")}</p>
        <p className="mt-1 text-[11px] text-mute">
          {formatJst(event.startAt, { date: true }).match(/\(.\)/)?.[0]} {formatJst(event.startAt, { time: true })}
        </p>
        {daysLeft !== null && daysLeft >= 0 && <p className="mt-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">{daysLeft === 0 ? "当日" : `あと${daysLeft}日`}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 max-w-full truncate text-[15px] font-bold text-ink">{event.title}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${planning ? "bg-lav-50 text-lav-700" : envelope ? (STATUS_TONE[envelope.status] ?? "bg-lav-50 text-lav-700") : "bg-white text-mute ring-1 ring-line"}`}>
            {planning ? "作成中" : envelope ? STATUS_LABEL[envelope.status] : "プラン未作成"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {event.artist} ・ {event.venue}
        </p>

        {plan ? (
          <>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">{plan.summary}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-lav-700">
              {beauty > 0 && <Chip icon={<Sparkles className="h-3 w-3" />} label={`美容 ${beauty}`} />}
              {transit > 0 && <Chip icon={<TrainFront className="h-3 w-3" />} label={`移動 ${transit}`} />}
              {flights > 0 && <Chip icon={<Plane className="h-3 w-3" />} label={`飛行機 ${flights}`} />}
              {stay > 0 && <Chip icon={<BedDouble className="h-3 w-3" />} label={`宿 ${stay}`} />}
              {plan.webSearches?.length ? <Chip icon={<Search className="h-3 w-3" />} label="Google 検索で調べた" /> : null}
            </ul>
            {next && (
              <p className="mt-2 text-xs text-ink">
                <span className="text-mute">次の準備：</span>
                {formatJst(next.start)} {next.title}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-mute">{planning ? "AI がプランを作っています…" : "まだプランがありません。"}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {plan ? (
            <button type="button" onClick={open} className="btn-primary flex min-h-[40px] items-center gap-1 rounded-xl px-3.5 text-xs font-bold text-white">
              プランを見る
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : planning ? (
            <button type="button" onClick={open} className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-line px-3.5 text-xs font-bold text-ink">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              作成中のプランを見る
            </button>
          ) : (
            !muted && (
              <button type="button" onClick={create} disabled={busy !== null} className="flex min-h-[40px] items-center gap-1 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" />
                プランを作る
              </button>
            )
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-1 rounded-full bg-lav-50 px-2 py-0.5">
      {icon}
      {label}
    </li>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { artistKey, clearImages, deleteImage, downscale, loadAllImages, readPersistPref, saveImage, writePersistPref } from "@/lib/client/imageStore";
import type { BookingResult, OshiEvent, PlanEnvelope, TimelineItem, TraceStep } from "@/lib/agent/types";

/**
 * クライアント状態はすべて React のメモリ上のみ（localStorage 等に保存しない）。
 * リロードで消えるのは「個人情報を保存しない」という設計方針の意図的な帰結。
 */

export interface SessionInfo {
  googleOAuthConfigured: boolean;
  calendarConnected: boolean;
  gemini: { configured: boolean; model: string; platform: string };
  ekispert: { mode: "mcp" | "mock" };
  youcam: { mode: "api" | "mock" };
}

export interface Availability {
  source: "google" | "demo";
  from: string;
  to: string;
  busyCount: number;
  freeSlots: { date: string; start: string; end: string; minutes: number }[];
  days: { date: string; busyMinutes: number; freeMinutes: number }[];
}

export interface ChatMessage {
  role: "user" | "agent" | "system";
  text: string;
}

export const OSHI_COLORS = [
  { id: "pink", label: "ピンク", hex: "#ec8aa2" },
  { id: "lilac", label: "ライラック", hex: "#b789ea" },
  { id: "sky", label: "スカイ", hex: "#6fb1e6" },
  { id: "mint", label: "ミント", hex: "#5fc7a5" },
  { id: "gold", label: "ゴールド", hex: "#e7b955" },
] as const;
export type OshiColor = (typeof OSHI_COLORS)[number]["id"];

type Busy = "importing" | "availability" | "planning" | "revising" | "approving" | "rejecting" | "booking" | null;

export interface Profile {
  homeStation: string;
  beautyServices: OshiEvent["beautyServices"];
  arriveEarlyForGoods: boolean;
}

export interface DetectedLiveEvent {
  key: string;
  artist: string;
  title: string;
  venue: string;
  venueStation: string;
  startAt: string;
  timeUnknown: boolean;
  confidence: "high" | "medium";
  source: "gemini" | "rules";
}

export interface ImportResult {
  source: "google" | "demo";
  scanned: number;
  found: number;
  added: number;
}

/** 予約の手続き状況（アプリ内の管理用メモ。実際の予約は各予約サイトで行う） */
export type ReservationStatus = "todo" | "reserved" | "cancelled";
export interface Reservation {
  id: string;
  eventId: string;
  eventTitle: string;
  kind: TimelineItem["kind"];
  category?: string;
  title: string;
  start: string;
  end: string;
  place?: string;
  priceJpy?: number;
  url?: string;
  note: string;
  status: ReservationStatus;
  confirmationNo?: string;
  memo?: string;
  updatedAt: string;
}

const DEFAULT_PROFILE: Profile = { homeStation: "長崎", beautyServices: ["brow", "hair"], arriveEarlyForGoods: true };

const byDate = (a: OshiEvent, b: OshiEvent) => Date.parse(a.startAt) - Date.parse(b.startAt);

async function api<T>(path: string, body?: unknown, action?: string): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(action ? { "x-oshiready-action": action } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

interface PlanResponse {
  envelope: PlanEnvelope;
  trace: TraceStep[];
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
  engine: "gemini" | "rule-based";
}

interface Store {
  session: SessionInfo | null;
  oshiColor: OshiColor;
  setOshiColor: (c: OshiColor) => void;
  /** 登録済みイベント（開催日順） */
  events: OshiEvent[];
  /** 現在プランを作る対象のイベント */
  event: OshiEvent | null;
  selectEvent: (id: string) => void;
  saveEvent: (e: OshiEvent) => void;
  removeEvent: (id: string) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  importFromCalendar: () => Promise<ImportResult | null>;
  lastImport: ImportResult | null;
  /** 選択中イベントの推し画像 */
  eventImage: string | null;
  /** 選択中イベントのアーティストの推し画像を設定（null で外す） */
  setEventImage: (file: Blob | null) => void;
  /** アーティストごとの推し画像（blob URL）。imageFor(event) で取得 */
  oshiImages: Record<string, string>;
  imageFor: (e: OshiEvent) => string | null;
  /** 推し画像をこの端末のブラウザに保存するか */
  persistImages: boolean;
  setPersistImages: (on: boolean) => void;
  clearSavedImages: () => Promise<void>;
  selfie: string | null;
  setSelfie: (dataUrl: string | null) => void;
  availability: Availability | null;
  envelope: PlanEnvelope | null;
  trace: TraceStep[];
  usage: PlanResponse["usage"] | null;
  engine: PlanResponse["engine"] | null;
  chat: ChatMessage[];
  /** 直近に手続きを始めた予約（プラン画面からの遷移用） */
  bookings: BookingResult[];
  reservations: Reservation[];
  updateReservation: (id: string, patch: Partial<Pick<Reservation, "status" | "confirmationNo" | "memo">>) => void;
  removeReservation: (id: string) => void;
  busy: Busy;
  error: string | null;
  clearError: () => void;
  refreshSession: () => Promise<void>;
  extractAvailability: () => Promise<void>;
  generatePlan: (eventOverride?: OshiEvent) => Promise<boolean>;
  revisePlan: (instruction: string) => Promise<void>;
  approve: (itemIds: string[]) => Promise<void>;
  reject: () => Promise<void>;
  book: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [oshiColor, setOshiColor] = useState<OshiColor>("pink");
  const [events, setEvents] = useState<OshiEvent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const event = events.find((e) => e.id === activeId) ?? events[0] ?? null;
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const [oshiImages, setOshiImages] = useState<Record<string, string>>({});
  const [selfie, setSelfie] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [envelope, setEnvelope] = useState<PlanEnvelope | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [usage, setUsage] = useState<PlanResponse["usage"] | null>(null);
  const [engine, setEngine] = useState<PlanResponse["engine"] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [bookings, setBookings] = useState<BookingResult[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(kind: Exclude<Busy, null>, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>("/api/session"));
    } catch {
      /* 表示のみのため無視 */
    }
  }, []);

  const importFromCalendar = useCallback(async (): Promise<ImportResult | null> => {
    setBusy("importing");
    setError(null);
    try {
      const r = await api<{ source: "google" | "demo"; scanned: number; events: DetectedLiveEvent[] }>("/api/calendar/detect-events", {});
      const known = new Set(eventsRef.current.map((e) => e.id));
      const fresh = r.events.filter((d) => !known.has(`cal-${d.key}`));
      const added = fresh.length;
      setEvents((prev) => {
        const next = [...prev];
        for (const d of fresh) {
          const id = `cal-${d.key}`;
          if (next.some((e) => e.id === id)) continue;
          next.push({
            id,
            artist: d.artist,
            title: d.title,
            venue: d.venue,
            venueStation: d.venueStation,
            startAt: d.startAt,
            homeStation: profile.homeStation,
            beautyServices: profile.beautyServices,
            arriveEarlyForGoods: profile.arriveEarlyForGoods,
            source: "calendar",
            timeUnknown: d.timeUnknown,
          });
        }
        return next.sort(byDate);
      });
      const result = { source: r.source, scanned: r.scanned, found: r.events.length, added };
      setLastImport(result);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [profile]);

  // 起動時（＝Google 連携直後のリダイレクト含む）にカレンダーからライブを自動で取り込む
  useEffect(() => {
    let alive = true;
    api<SessionInfo>("/api/session")
      .then((s) => alive && setSession(s))
      .catch(() => undefined);
    const t = setTimeout(() => {
      if (alive) void importFromCalendar();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 起動時に 1 回だけ
  }, []);

  const [persistImages, setPersistImagesState] = useState(false);
  const imageFor = useCallback((e: OshiEvent) => oshiImages[artistKey(e.artist)] ?? null, [oshiImages]);
  const eventImage = event ? imageFor(event) : null;
  const eventArtist = event?.artist;

  // 起動時: 保存設定を読み、保存済みの推し画像を復元（この端末のブラウザ内のみ）
  useEffect(() => {
    const on = readPersistPref();
    let alive = true;
    const t = setTimeout(() => {
      setPersistImagesState(on);
      if (!on) return;
      void loadAllImages().then((all) => {
        if (!alive) return;
        const urls: Record<string, string> = {};
        for (const [k, blob] of Object.entries(all)) urls[k] = URL.createObjectURL(blob);
        setOshiImages((prev) => ({ ...urls, ...prev }));
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const setEventImage = useCallback(
    (file: Blob | null) => {
      if (!eventArtist) return;
      const key = artistKey(eventArtist);
      void (async () => {
        const blob = file ? await downscale(file) : null;
        const url = blob ? URL.createObjectURL(blob) : null;
        setOshiImages((prev) => {
          const old = prev[key];
          if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
          const next = { ...prev };
          if (url) next[key] = url;
          else delete next[key];
          return next;
        });
        if (persistImages) {
          if (blob) await saveImage(key, blob);
          else await deleteImage(key);
        }
      })();
    },
    [eventArtist, persistImages],
  );

  const setPersistImages = useCallback(
    (on: boolean) => {
      setPersistImagesState(on);
      writePersistPref(on);
      if (!on) {
        void clearImages();
        return;
      }
      // ON にしたら、いま表示中の画像を保存
      void (async () => {
        for (const [k, url] of Object.entries(oshiImages)) {
          const blob = await fetch(url).then((r) => r.blob()).catch(() => null);
          if (blob) await saveImage(k, blob);
        }
      })();
    },
    [oshiImages],
  );

  const applyPlan = useCallback((r: PlanResponse) => {
    setEnvelope(r.envelope);
    setTrace(r.trace);
    setUsage(r.usage);
    setEngine(r.engine);
    setBookings([]);
  }, []);

  const store: Store = useMemo(
    () => ({
      session,
      oshiColor,
      setOshiColor,
      events,
      event,
      selectEvent: (id) => {
        if (id === event?.id) return;
        setActiveId(id);
        setEnvelope(null);
        setChat([]);
        setAvailability(null);
      },
      saveEvent: (e) => {
        setEvents((prev) => [...prev.filter((x) => x.id !== e.id), e].sort(byDate));
        setActiveId(e.id);
        setEnvelope(null);
        setChat([]);
      },
      removeEvent: (id) => {
        setEvents((prev) => prev.filter((x) => x.id !== id));
        if (event?.id === id) {
          setActiveId(null);
          setEnvelope(null);
          setChat([]);
        }
      },
      profile,
      setProfile: (p) => {
        setProfile(p);
        // 取り込み済みイベントにも出発駅・美容メニューの既定値を反映
        setEvents((prev) => prev.map((e) => ({ ...e, homeStation: p.homeStation, beautyServices: p.beautyServices, arriveEarlyForGoods: p.arriveEarlyForGoods })));
        setEnvelope(null);
      },
      importFromCalendar,
      lastImport,
      eventImage,
      setEventImage,
      oshiImages,
      imageFor,
      persistImages,
      setPersistImages,
      clearSavedImages: async () => {
        await clearImages();
        setOshiImages((prev) => {
          for (const u of Object.values(prev)) if (u.startsWith("blob:")) URL.revokeObjectURL(u);
          return {};
        });
      },
      selfie,
      setSelfie,
      availability,
      envelope,
      trace,
      usage,
      engine,
      chat,
      bookings,
      reservations,
      updateReservation: (id, patch) =>
        setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r))),
      removeReservation: (id) => setReservations((prev) => prev.filter((r) => r.id !== id)),
      busy,
      error,
      clearError: () => setError(null),
      refreshSession,
      extractAvailability: async () => {
        const r = await run("availability", () => api<Availability>("/api/calendar/availability", { until: event?.startAt }));
        if (r) setAvailability(r);
      },
      generatePlan: async (eventOverride) => {
        const target = eventOverride ?? event;
        if (!target) {
          setError("先にイベントを登録してください");
          return false;
        }
        const r = await run("planning", () => api<PlanResponse>("/api/agent/plan", { event: target, selfie: selfie ?? undefined }));
        if (r) {
          applyPlan(r);
          setChat([{ role: "agent", text: r.envelope.plan.summary }]);
          // 顔画像は一度解析に使ったらクライアントのメモリからも破棄
          setSelfie(null);
        }
        return Boolean(r);
      },
      revisePlan: async (instruction) => {
        if (!envelope) return;
        setChat((c) => [...c, { role: "user", text: instruction }]);
        const r = await run("revising", () => api<PlanResponse>("/api/agent/revise", { envelope, instruction }));
        if (r) {
          applyPlan(r);
          setChat((c) => [...c, { role: "agent", text: `修正しました（改訂 ${r.envelope.plan.revision}）。${r.envelope.plan.summary}` }]);
        } else {
          setChat((c) => [...c, { role: "system", text: "修正に失敗しました。もう一度お試しください。" }]);
        }
      },
      approve: async (itemIds) => {
        if (!envelope) return;
        const r = await run("approving", () => api<{ envelope: PlanEnvelope }>("/api/plan/approve", { envelope, approvedItemIds: itemIds }, "approve"));
        if (r) setEnvelope(r.envelope);
      },
      reject: async () => {
        if (!envelope) return;
        const r = await run("rejecting", () => api<{ envelope: PlanEnvelope }>("/api/plan/reject", { envelope }, "reject"));
        if (r) setEnvelope(r.envelope);
      },
      book: async () => {
        if (!envelope) return;
        const r = await run("booking", () =>
          api<{ envelope: PlanEnvelope; results: BookingResult[] }>("/api/booking", { envelope, confirm: true }, "book"),
        );
        if (r) {
          setEnvelope(r.envelope);
          setBookings(r.results);
          const plan = r.envelope.plan;
          const now = new Date().toISOString();
          const added: Reservation[] = r.results.flatMap((b) => {
            const item = plan.items.find((i) => i.id === b.itemId);
            if (!item) return [];
            return [{
              id: `${plan.event.id}:${plan.id}:${item.id}`,
              eventId: plan.event.id,
              eventTitle: plan.event.title,
              kind: item.kind,
              category: item.category,
              title: b.title,
              start: item.start,
              end: item.end,
              place: item.location ?? item.route?.to,
              priceJpy: item.provider?.priceJpy ?? item.route?.fareJpy,
              url: b.externalUrl,
              note: b.note,
              status: "todo" as const,
              updatedAt: now,
            }];
          });
          setReservations((prev) => [...prev.filter((x) => !added.some((a) => a.id === x.id)), ...added].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
        }
      },
      disconnect: async () => {
        await run("availability", () => api("/api/auth/logout", {}));
        setAvailability(null);
        setEvents((prev) => prev.filter((e) => e.source !== "calendar"));
        await refreshSession();
      },
    }),
    [session, oshiColor, events, event, profile, importFromCalendar, lastImport, eventImage, setEventImage, oshiImages, imageFor, persistImages, setPersistImages, reservations, selfie, availability, envelope, trace, usage, engine, chat, bookings, busy, error, refreshSession, run, applyPlan],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

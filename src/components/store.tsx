"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BookingResult, OshiEvent, PlanEnvelope, TraceStep } from "@/lib/agent/types";

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

type Busy = "availability" | "planning" | "revising" | "approving" | "rejecting" | "booking" | null;

function defaultEvent(): OshiEvent {
  let start = "2026-10-30T18:00:00+09:00";
  if (Date.parse(start) < Date.now() + 5 * 86_400_000) {
    const d = new Date(Date.now() + 35 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
    start = `${d}T18:00:00+09:00`;
  }
  return {
    id: "demo-ive-kyocera",
    artist: "IVE",
    title: "IVE 京セラドーム公演",
    venue: "京セラドーム大阪",
    venueStation: "ドーム前千代崎",
    startAt: start,
    homeStation: "長崎",
    beautyServices: ["brow", "hair"],
    arriveEarlyForGoods: true,
  };
}

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
  event: OshiEvent;
  setEvent: (e: OshiEvent) => void;
  eventImage: string | null;
  setEventImage: (url: string | null) => void;
  selfie: string | null;
  setSelfie: (dataUrl: string | null) => void;
  availability: Availability | null;
  envelope: PlanEnvelope | null;
  trace: TraceStep[];
  usage: PlanResponse["usage"] | null;
  engine: PlanResponse["engine"] | null;
  chat: ChatMessage[];
  bookings: BookingResult[];
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
  const [event, setEvent] = useState<OshiEvent>(defaultEvent);
  const [eventImage, setEventImageState] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [envelope, setEnvelope] = useState<PlanEnvelope | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [usage, setUsage] = useState<PlanResponse["usage"] | null>(null);
  const [engine, setEngine] = useState<PlanResponse["engine"] | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [bookings, setBookings] = useState<BookingResult[]>([]);
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

  useEffect(() => {
    let alive = true;
    api<SessionInfo>("/api/session")
      .then((s) => alive && setSession(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const setEventImage = useCallback((url: string | null) => {
    setEventImageState((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

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
      event,
      setEvent: (e) => {
        setEvent(e);
        setEnvelope(null);
        setChat([]);
      },
      eventImage,
      setEventImage,
      selfie,
      setSelfie,
      availability,
      envelope,
      trace,
      usage,
      engine,
      chat,
      bookings,
      busy,
      error,
      clearError: () => setError(null),
      refreshSession,
      extractAvailability: async () => {
        const r = await run("availability", () => api<Availability>("/api/calendar/availability", { until: event.startAt }));
        if (r) setAvailability(r);
      },
      generatePlan: async (eventOverride) => {
        const target = eventOverride ?? event;
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
        }
      },
      disconnect: async () => {
        await run("availability", () => api("/api/auth/logout", {}));
        setAvailability(null);
        await refreshSession();
      },
    }),
    [session, event, eventImage, setEventImage, selfie, availability, envelope, trace, usage, engine, chat, bookings, busy, error, refreshSession, run, applyPlan],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

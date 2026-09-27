import "server-only";
import type { TimelineItem } from "../agent/types";
import { seal, unseal } from "../crypto";
import { demoProvider } from "./demo";
import type { BookingProvider } from "./types";

/** 予約の部品の一覧（本物の予約 API を使う部品ができたらここに足す） */
const ALL_PROVIDERS: BookingProvider[] = [demoProvider];

/** 環境変数 BOOKING_PROVIDERS（カンマ区切り、既定 demo）で使う部品を選ぶ。空にするとアプリ内予約をやめ、予約サイトへの案内だけにする */
export function enabledProviders(): BookingProvider[] {
  const allow = (process.env.BOOKING_PROVIDERS ?? "demo").split(",").map((v) => v.trim()).filter(Boolean);
  return ALL_PROVIDERS.filter((p) => allow.includes(p.id));
}

export function providerFor(item: TimelineItem): BookingProvider | undefined {
  return enabledProviders().find((p) => p.supports(item));
}

/**
 * キャンセル用の控え。部品名・予約の参照・対象を暗号化して利用者の端末に渡し、
 * キャンセル時にだけ受け取る（サーバーには何も保存しない。改ざん・偽造はできない）。
 */
interface CancelTicket {
  v: 1;
  provider: string;
  ref: string;
  itemId: string;
  planId: string;
  exp: number;
}

const TICKET_TTL_MS = 200 * 86_400_000;

export function issueCancelTicket(t: Omit<CancelTicket, "v" | "exp">, now = Date.now()): string {
  return seal(JSON.stringify({ v: 1, ...t, exp: now + TICKET_TTL_MS } satisfies CancelTicket), "booking");
}

export function readCancelTicket(token: string, now = Date.now()): CancelTicket | null {
  const json = unseal(token, "booking");
  if (!json) return null;
  try {
    const t = JSON.parse(json) as CancelTicket;
    if (t.v !== 1 || typeof t.ref !== "string" || typeof t.provider !== "string" || t.exp < now) return null;
    return t;
  } catch {
    return null;
  }
}

export function providerById(id: string): BookingProvider | undefined {
  return enabledProviders().find((p) => p.id === id);
}

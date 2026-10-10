import { describe, expect, it } from "vitest";
import { signEnvelope } from "@/lib/agent/envelope";
import type { HistoryEntry, Plan } from "@/lib/agent/types";
import { issueCancelTicket, readCancelTicket } from "@/lib/booking";
import { POST as book } from "@/app/api/booking/route";
import { POST as cancel } from "@/app/api/booking/cancel/route";

const future = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const plan: Plan = {
  id: "p1",
  event: {
    id: "e1", artist: "LUMIRISE", title: "LUMIRISE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
    startAt: `${future}T18:00:00+09:00`, homeStation: "長崎", beautyServices: ["brow"], arriveEarlyForGoods: true,
  },
  summary: "s",
  items: [
    { id: "b1", kind: "beauty", title: "眉毛サロン", start: `${future}T10:00:00+09:00`, end: `${future}T11:00:00+09:00`, rationale: "r", requiresBooking: true },
    { id: "ev", kind: "event", title: "live", start: `${future}T18:00:00+09:00`, end: `${future}T21:00:00+09:00`, rationale: "r", requiresBooking: false },
  ],
  warnings: [],
  generatedBy: { engine: "rule-based", model: "rules-v1" },
  revision: 0,
  createdAt: new Date().toISOString(),
};
const at = new Date().toISOString();
const approvedHistory: HistoryEntry[] = [
  { status: "draft", at, actor: "user" },
  { status: "generating", at, actor: "user" },
  { status: "pending_approval", at, actor: "agent" },
  { status: "approved", at, actor: "user" },
];

const req = (path: string, body: unknown, action?: string) =>
  new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", ...(action ? { "x-oshiready-action": action } : {}) },
    body: JSON.stringify(body),
  });

describe("アプリ内予約（デモ予約）", () => {
  it("承認済みの項目だけを予約し、予約番号とキャンセル用の控えを返す", async () => {
    const envelope = signEnvelope({ plan, status: "approved", approvedItemIds: ["b1"], history: approvedHistory });
    const res = await book(req("/api/booking", { envelope, confirm: true }, "book"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { envelope: { status: string }; results: { itemId: string; status: string; confirmationNo?: string; demo?: boolean; cancelTicket?: string }[] };
    expect(body.envelope.status).toBe("booked");
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ itemId: "b1", status: "reserved", demo: true });
    expect(body.results[0].confirmationNo).toMatch(/^DEMO-BT-[A-Z2-9]{6}$/);
    expect(readCancelTicket(body.results[0].cancelTicket!)).toMatchObject({ provider: "demo", itemId: "b1", planId: "p1" });
  });

  it("同じ承認で 2 回目の予約はできない（二重予約の防止）", async () => {
    const envelope = signEnvelope({ plan: { ...plan, id: "p-once" }, status: "approved", approvedItemIds: ["b1"], history: approvedHistory });
    expect((await book(req("/api/booking", { envelope, confirm: true }, "book"))).status).toBe(200);
    const again = await book(req("/api/booking", { envelope, confirm: true }, "book"));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toContain("すでに予約の手続き");
  });

  it("あなたの承認がないプランは予約できない", async () => {
    const envelope = signEnvelope({ plan, status: "pending_approval", approvedItemIds: ["b1"], history: approvedHistory.slice(0, 3) });
    const res = await book(req("/api/booking", { envelope, confirm: true }, "book"));
    expect(res.status).toBe(409);
  });

  it("キャンセルは確認の操作と正しい控えがあるときだけ実行できる", async () => {
    const ticket = issueCancelTicket({ provider: "demo", ref: "demo:x", itemId: "b1", planId: "p1" });
    expect((await cancel(req("/api/booking/cancel", { ticket, confirm: true }))).status).toBe(403); // 画面の確認を経ていない
    expect((await cancel(req("/api/booking/cancel", { ticket: ticket.slice(0, -4) + "AAAA", confirm: true }, "cancel"))).status).toBe(400); // 改ざん
    const ok = await cancel(req("/api/booking/cancel", { ticket, confirm: true }, "cancel"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "cancelled", demo: true });
  });

  it("期限切れの控えは使えない", () => {
    const old = issueCancelTicket({ provider: "demo", ref: "demo:x", itemId: "b1", planId: "p1" }, Date.now() - 400 * 86_400_000);
    expect(readCancelTicket(old)).toBeNull();
  });
});

describe("デモ予約の対象", () => {
  it("経路の確認など、予約ではない確認項目は予約せず予約サイトへ案内する", async () => {
    const withCheck: Plan = {
      ...plan,
      items: [...plan.items, { id: "tc", kind: "prep", category: "transit-check", title: "経路を確認", start: `${future}T09:00:00+09:00`, end: `${future}T09:10:00+09:00`, rationale: "r", requiresBooking: true }],
    };
    const envelope = signEnvelope({ plan: withCheck, status: "approved", approvedItemIds: ["b1", "tc"], history: approvedHistory });
    const body = (await (await book(req("/api/booking", { envelope, confirm: true }, "book"))).json()) as { results: { itemId: string; status: string }[] };
    expect(Object.fromEntries(body.results.map((r) => [r.itemId, r.status]))).toEqual({ b1: "reserved", tc: "handoff" });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Plan, TimelineItem } from "@/lib/agent/types";
import { detectSignals, reviewInstruction, signalKey } from "@/lib/agent/watch";
import type { BusyBlock } from "@/lib/privacy/mask";

/**
 * 見張り（承認後の変化の検出と、自動の見直し）のテスト。
 */

vi.mock("@google/genai", () => ({
  FunctionCallingConfigMode: { ANY: "ANY" },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => {
        const call = { name: "submit_timeline", args: { summary: "雨に備えて傘を入れました", items: [prep("p1", "持ち物（折りたたみ傘）", 1, "21:00")] } };
        return {
          functionCalls: [{ id: "c0", ...call }],
          candidates: [{ content: { role: "model", parts: [{ functionCall: call }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        };
      }),
    };
  },
}));
vi.mock("@/lib/sources", () => ({ collectBusy: async () => ({ source: "demo", sources: [], busy: [] }) }));

process.env.GEMINI_API_KEY = "test-key";
process.env.SESSION_SECRET = "x".repeat(48);

const NOW = Date.now();
const eventDay = new Date(NOW + 5 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const startAt = `${eventDay}T18:00:00+09:00`;
const daysBefore = (n: number, hm: string) => {
  const d = new Date(Date.parse(`${eventDay}T00:00:00+09:00`) - n * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10);
  return `${d}T${hm}:00+09:00`;
};
function prep(id: string, title: string, n: number, hm: string): TimelineItem {
  const start = daysBefore(n, hm);
  return { id, kind: "prep", category: "transit-check", title, start, end: new Date(Date.parse(start) + 15 * 60_000).toISOString(), rationale: "前日に確認", requiresBooking: false };
}
const hair: TimelineItem = {
  id: "b1", kind: "beauty", category: "hair", title: "ヘアカット", start: daysBefore(3, "19:00"), end: daysBefore(3, "20:30"),
  provider: { name: "予約サイトで店舗と空きを確認" }, rationale: "推奨の 2〜5 日前", requiresBooking: true,
};
const plan: Plan = {
  id: "plan1",
  event: { id: "e1", artist: "IVE", title: "公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎", startAt, homeStation: "大阪", beautyServices: ["hair"], arriveEarlyForGoods: false },
  summary: "提案です",
  decisions: [],
  items: [hair, prep("p1", "経路の確認", 1, "21:00"), { id: "ev", kind: "event", title: "公演", start: startAt, end: `${eventDay}T21:00:00+09:00`, rationale: "本番", requiresBooking: false }],
  warnings: [],
  generatedBy: { engine: "gemini", model: "m" },
  revision: 2,
  createdAt: new Date(NOW).toISOString(),
};
const block = (start: string, end: string): BusyBlock => ({ start, end, allDay: false, label: "予定あり" });
const rain = { date: eventDay, sky: "rain", text: "雨 時々 くもり", needsRainGear: true };

describe("変化の検出（AI は呼ばない）", () => {
  it("何も変わっていなければ信号なし", () => {
    expect(detectSignals({ plan, busy: [], forecast: { ...rain, sky: "clear", needsRainGear: false }, now: NOW })).toEqual([]);
  });

  it("後から入った予定と重なった項目を見つける（公演本体は対象外）", () => {
    const busy = [block(daysBefore(3, "19:30"), daysBefore(3, "21:00")), block(startAt, `${eventDay}T21:00:00+09:00`)];
    const s = detectSignals({ plan, busy, now: NOW });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "conflict", itemIds: ["b1"] });
  });

  it("カレンダー未連携（busy=null）のときは重なりを判定しない", () => {
    expect(detectSignals({ plan, busy: null, now: NOW })).toEqual([]);
  });

  it("公演日が雨予報になり、プランが濡れ対策に触れていなければ知らせる", () => {
    expect(detectSignals({ plan, busy: null, forecast: rain, now: NOW })).toEqual([{ kind: "rain", date: eventDay, text: "雨 時々 くもり", sky: "rain" }]);
  });

  it("すでに傘などに触れていれば知らせない", () => {
    const withUmbrella = { ...plan, items: [...plan.items, prep("p2", "折りたたみ傘を用意", 1, "22:00")] };
    expect(detectSignals({ plan: withUmbrella, busy: null, forecast: rain, now: NOW })).toEqual([]);
  });

  it("別の日の予報には反応しない", () => {
    expect(detectSignals({ plan, busy: null, forecast: { ...rain, date: "2000-01-01" }, now: NOW })).toEqual([]);
  });

  it("同じ変化には同じ目印。プランが改訂されると別の目印になる（同じ変化で何度も AI を呼ばない）", () => {
    const s = detectSignals({ plan, busy: null, forecast: rain, now: NOW });
    expect(signalKey(plan, s)).toBe(signalKey(plan, [...s]));
    expect(signalKey({ ...plan, revision: 3 }, s)).not.toBe(signalKey(plan, s));
  });

  it("見直しの指示文はサーバーで組み立て、承認済みの項目は動かさないよう伝える", () => {
    const text = reviewInstruction([{ kind: "conflict", itemIds: ["b1"], titles: ["ヘアカット（10/20 19:00）"] }, { kind: "rain", date: eventDay, text: "雨", sky: "rain" }], ["ヘアカット"]);
    expect(text).toContain("ヘアカット（10/20 19:00）");
    expect(text).toContain("濡れ対策");
    expect(text).toContain("承認済みの次の項目");
  });
});

describe("自動の見直し（system が始め、必ず承認待ちで止まる）", () => {
  it("期限切れの承認済みプランを参考に、新しい承認待ちのプランを作る", async () => {
    const { generatePlan } = await import("@/lib/agent/workflow");
    const out = await generatePlan({
      event: plan.event,
      basePlan: plan,
      instruction: reviewInstruction([{ kind: "rain", date: eventDay, text: "雨", sky: "rain" }], []),
      initiatedBy: "system",
      requestId: "review",
    });
    expect(out.envelope.status).toBe("pending_approval");
    expect(out.envelope.approvedItemIds).toEqual([]);
    expect(out.envelope.plan.id).toBe("plan1");
    expect(out.envelope.plan.revision).toBe(3);
    // 古い承認を流用せず、新しい履歴で始まる。始めたのは system、承認待ちにしたのは agent
    expect(out.envelope.history.map((h) => `${h.status}:${h.actor}`)).toEqual(["draft:system", "generating:system", "pending_approval:agent"]);
  });

  it("期限切れの封筒は、参照（allowExpired）はできても状態を進める検証には通らない", async () => {
    const { signEnvelope, verifyEnvelope } = await import("@/lib/agent/envelope");
    const old = signEnvelope({ plan, status: "approved", approvedItemIds: ["b1"], history: [] }, NOW - 3 * 3_600_000);
    expect(() => verifyEnvelope(old)).toThrow(/有効期限/);
    expect(verifyEnvelope(old, Date.now(), { allowExpired: true }).status).toBe("approved");
  });
});

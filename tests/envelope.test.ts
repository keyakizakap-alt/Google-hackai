import { describe, expect, it } from "vitest";
import { signEnvelope, verifyEnvelope } from "@/lib/agent/envelope";
import { GuardrailError } from "@/lib/agent/stateMachine";
import type { Plan } from "@/lib/agent/types";

const plan: Plan = {
  id: "p1",
  event: {
    id: "e1", artist: "IVE", title: "IVE 京セラドーム公演", venue: "京セラドーム大阪", venueStation: "ドーム前千代崎",
    startAt: "2026-10-30T18:00:00+09:00", homeStation: "長崎", beautyServices: ["brow"], arriveEarlyForGoods: true,
  },
  summary: "s",
  items: [{ id: "a", kind: "event", title: "live", start: "2026-10-30T18:00:00+09:00", end: "2026-10-30T21:00:00+09:00", rationale: "r", requiresBooking: false }],
  warnings: [],
  generatedBy: { engine: "rule-based", model: "rules-v1" },
  revision: 0,
  createdAt: new Date().toISOString(),
};

describe("plan envelope signature", () => {
  it("verifies an untampered envelope", () => {
    const env = signEnvelope({ plan, status: "pending_approval", approvedItemIds: [], history: [] });
    expect(verifyEnvelope(JSON.parse(JSON.stringify(env))).status).toBe("pending_approval");
  });

  it("detects client-side status tampering", () => {
    const env = signEnvelope({ plan, status: "pending_approval", approvedItemIds: [], history: [] });
    expect(() => verifyEnvelope({ ...env, status: "approved" })).toThrow(GuardrailError);
  });

  it("rejects expired envelopes", () => {
    const env = signEnvelope({ plan, status: "pending_approval", approvedItemIds: [], history: [] }, Date.now() - 3 * 3600_000);
    expect(() => verifyEnvelope(env)).toThrow(/有効期限/);
  });

  it("項目の並び順が違うプランでも、署名と検証が一致する", () => {
    const reordered = { decisions: [{ topic: "t", chosen: "c", alternatives: [], reason: "r" }], ...plan } as Plan;
    const env = signEnvelope({ plan: reordered, status: "pending_approval", approvedItemIds: [], history: [] });
    expect(verifyEnvelope(JSON.parse(JSON.stringify(env))).plan.decisions).toHaveLength(1);
  });
});

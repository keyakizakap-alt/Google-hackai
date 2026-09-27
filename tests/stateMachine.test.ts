import { describe, expect, it } from "vitest";
import { advance, assertTransition, canTransition, GuardrailError, hasUserApproval } from "@/lib/agent/stateMachine";
import { PLAN_STATUSES, type HistoryEntry } from "@/lib/agent/types";

describe("Human-in-the-loop state machine", () => {
  it("agent can never approve or book", () => {
    for (const from of PLAN_STATUSES) {
      expect(canTransition(from, "approved", "agent")).toBe(false);
      expect(canTransition(from, "booking", "agent")).toBe(false);
      expect(canTransition(from, "approved", "system")).toBe(false);
    }
  });

  it("booking is reachable only via pending_approval -> approved", () => {
    // BFS over the transition graph: every path from draft to booking must visit pending_approval
    const reachableWithout = new Set(["draft"]);
    const queue = ["draft"] as (typeof PLAN_STATUSES)[number][];
    while (queue.length) {
      const s = queue.shift()!;
      for (const to of PLAN_STATUSES) {
        if (to === "pending_approval" || reachableWithout.has(to)) continue;
        if (canTransition(s, to, "user") || canTransition(s, to, "agent")) {
          reachableWithout.add(to);
          queue.push(to);
        }
      }
    }
    expect(reachableWithout.has("approved")).toBe(false);
    expect(reachableWithout.has("booking")).toBe(false);
  });

  it("rejects skipping approval", () => {
    expect(() => assertTransition("generating", "approved", "user")).toThrow(GuardrailError);
    expect(() => assertTransition("pending_approval", "booking", "user")).toThrow(GuardrailError);
  });

  it("records user approval in history", () => {
    let h: HistoryEntry[] = [{ status: "draft", at: new Date().toISOString(), actor: "user" }];
    h = advance(h, "draft", "generating", "user");
    h = advance(h, "generating", "pending_approval", "agent");
    expect(hasUserApproval(h)).toBe(false);
    h = advance(h, "pending_approval", "approved", "user");
    expect(hasUserApproval(h)).toBe(true);
  });
});

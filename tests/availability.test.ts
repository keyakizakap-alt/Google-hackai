import { describe, expect, it } from "vitest";
import { extractFreeSlots, overlapsBusy } from "@/lib/availability";
import type { BusyBlock } from "@/lib/privacy/mask";

const b = (s: string, e: string): BusyBlock => ({ start: s, end: e, allDay: false, label: "予定あり" });

describe("extractFreeSlots", () => {
  it("subtracts busy blocks with buffer inside the daily window", () => {
    const from = Date.parse("2026-10-20T00:00:00+09:00");
    const to = Date.parse("2026-10-21T00:00:00+09:00");
    const slots = extractFreeSlots([b("2026-10-20T12:00:00+09:00", "2026-10-20T13:00:00+09:00")], { from, to, bufferMinutes: 30 });
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ["2026-10-20T09:00:00+09:00", "2026-10-20T11:30:00+09:00"],
      ["2026-10-20T13:30:00+09:00", "2026-10-20T21:00:00+09:00"],
    ]);
  });

  it("drops slots shorter than minMinutes and handles all-day busy", () => {
    const from = Date.parse("2026-10-20T00:00:00+09:00");
    const to = Date.parse("2026-10-22T00:00:00+09:00");
    const slots = extractFreeSlots(
      [
        { start: "2026-10-20T00:00:00+09:00", end: "2026-10-21T00:00:00+09:00", allDay: true, label: "予定あり" },
        b("2026-10-21T09:45:00+09:00", "2026-10-21T20:30:00+09:00"),
      ],
      { from, to, bufferMinutes: 0, minMinutes: 60 },
    );
    expect(slots).toEqual([]);
  });

  it("detects overlaps", () => {
    const busy = [b("2026-10-20T12:00:00+09:00", "2026-10-20T13:00:00+09:00")];
    expect(overlapsBusy(busy, Date.parse("2026-10-20T13:05:00+09:00"), Date.parse("2026-10-20T14:00:00+09:00"), 15)).toBe(true);
    expect(overlapsBusy(busy, Date.parse("2026-10-20T13:20:00+09:00"), Date.parse("2026-10-20T14:00:00+09:00"), 15)).toBe(false);
  });
});

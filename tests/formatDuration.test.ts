import { describe, expect, it } from "vitest";
import { formatDuration } from "@/components/AgentConsole";

describe("formatDuration（AI の所要時間の表示）", () => {
  it("1 秒未満はミリ秒、それ以上は秒で表示する", () => {
    expect(formatDuration(0)).toBe("<1ms");
    expect(formatDuration(42.4)).toBe("42ms");
    expect(formatDuration(1234)).toBe("1.2秒");
    expect(formatDuration(23_456)).toBe("23秒");
  });
});

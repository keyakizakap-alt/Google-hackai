import { describe, expect, it, vi } from "vitest";
import { gateForDetection, sanitizeBusy } from "@/lib/sources/gate";

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("共通の安全チェック（gate）", () => {
  it("空き時間は時間帯以外の項目を捨てて作り直す", () => {
    const leaky = [{ start: future(1), end: future(1.1), allDay: false, label: "予定あり", summary: "病院", location: "東京" } as never];
    const out = sanitizeBusy(leaky);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(["allDay", "end", "label", "start"]);
    expect(JSON.stringify(out)).not.toMatch(/病院|東京/);
  });

  it("壊れた時間帯は捨てる", () => {
    expect(sanitizeBusy([{ start: "x", end: "y", allDay: false, label: "予定あり" }])).toEqual([]);
  });

  it("ライブ以外の予定は候補に残らず、元の配列も空にする", () => {
    const items = [
      { id: "a", summary: "IVE 京セラドーム公演", start: { dateTime: future(20) } },
      { id: "b", summary: "歯医者", start: { dateTime: future(2) } },
    ];
    const r = gateForDetection(items);
    expect(r.scanned).toBe(2);
    expect(r.candidates.map((c) => c.summary)).toEqual(["IVE 京セラドーム公演"]);
    expect(items).toHaveLength(0);
  });
});

describe("秘密の値の入れ替え（SESSION_SECRET / SESSION_SECRET_PREVIOUS）", () => {
  it("古い値で作った署名・暗号は、入れ替え後も読める。新しい値で作り直される", async () => {
    vi.resetModules();
    process.env.SESSION_SECRET = "old-secret-0123456789-abcdefghijklmnop";
    delete process.env.SESSION_SECRET_PREVIOUS;
    const oldCrypto = await import("@/lib/crypto");
    const sealed = oldCrypto.seal("hello", "session");
    const sig = oldCrypto.hmac("data", "plan");

    vi.resetModules();
    process.env.SESSION_SECRET = "new-secret-0123456789-abcdefghijklmnop";
    process.env.SESSION_SECRET_PREVIOUS = "old-secret-0123456789-abcdefghijklmnop";
    const rotated = await import("@/lib/crypto");
    expect(rotated.unseal(sealed, "session")).toBe("hello");
    expect(rotated.verifyHmac("data", sig, "plan")).toBe(true);
    expect(rotated.hmac("data", "plan")).not.toBe(sig);

    vi.resetModules();
    delete process.env.SESSION_SECRET_PREVIOUS;
    const afterGrace = await import("@/lib/crypto");
    expect(afterGrace.unseal(sealed, "session")).toBeNull();
    expect(afterGrace.verifyHmac("data", sig, "plan")).toBe(false);
    delete process.env.SESSION_SECRET;
  });
});

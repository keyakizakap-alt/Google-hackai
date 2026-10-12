import { describe, expect, it, vi } from "vitest";

/**
 * 画面のエラーの記録（/api/client-error）。原因の特定に必要な最小限だけを、伏せてから残す。
 */
const written: string[] = [];
vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
  written.push(String(chunk));
  return true;
});

const post = async (body: unknown, origin = "http://localhost:3000") => {
  const { POST } = await import("@/app/api/client-error/route");
  return POST(new Request("http://localhost:3000/api/client-error", { method: "POST", headers: { origin, host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) }));
};

describe("/api/client-error", () => {
  it("エラーの種類・短い説明・画面のパスを、URL とメールアドレスを伏せて残す", async () => {
    written.length = 0;
    const res = await post({ kind: "global", name: "TypeError", message: "Cannot read 'items' see https://example.com/x by a@example.com", digest: "12345", path: "/plan?event=secret" });
    expect(res.status).toBe(200);
    const line = JSON.parse(written.find((w) => w.includes("client.error"))!);
    expect(line).toMatchObject({ message: "client.error", mode: "global", errorCode: "TypeError", page: "/plan", digest: "12345" });
    expect(line.clientMessage).not.toContain("https://");
    expect(line.clientMessage).not.toContain("a@example.com");
    expect(JSON.stringify(line)).not.toContain("secret");
  });

  it("別のサイトからの送信と、形の違う送信は受け付けない", async () => {
    expect((await post({ kind: "global" }, "https://evil.example")).status).toBe(403);
    expect((await post({ kind: "other" })).status).toBe(400);
  });
});

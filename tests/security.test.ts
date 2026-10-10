import { afterEach, describe, expect, it } from "vitest";
import { assertSameOrigin, BodyTooLargeError, clientIp, readJson, redirectBase } from "@/lib/http";
import { safeExternalUrl } from "@/lib/safeUrl";
import { isAllowedTool } from "@/lib/services/ekispert";

describe("safeExternalUrl (AI が作るリンクの許可リスト)", () => {
  it("allows only https links on approved hosts", () => {
    expect(safeExternalUrl("https://beauty.hotpepper.jp/CSP/bt/salonSearch/search/?freeword=x")).toBeDefined();
    expect(safeExternalUrl("https://www.jalan.net/uw/uwp1700/uww1701.do?keyword=x")).toBeDefined();
    expect(safeExternalUrl("http://beauty.hotpepper.jp/")).toBeUndefined();
    expect(safeExternalUrl("https://beauty.hotpepper.jp.evil.example/")).toBeUndefined();
    expect(safeExternalUrl("https://user:pw@www.jalan.net/")).toBeUndefined();
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("not a url")).toBeUndefined();
  });
});

describe("clientIp", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const req = (xff: string) => new Request("http://x", { headers: { "x-forwarded-for": xff } });

  it("ignores spoofed leading entries outside Vercel", () => {
    delete process.env.VERCEL;
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(req("6.6.6.6, 203.0.113.9, 34.1.1.1"))).toBe("203.0.113.9");
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(clientIp(req("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
  });

  it("uses the platform-provided value on Vercel", () => {
    process.env.VERCEL = "1";
    expect(clientIp(req("203.0.113.9"))).toBe("203.0.113.9");
  });
});

describe("Ekispert MCP tool allowlist", () => {
  afterEach(() => {
    delete process.env.EKISPERT_ALLOWED_TOOLS;
  });
  it("exposes search-like tools and hides write-like ones by default", () => {
    expect(isAllowedTool("search_course", "経路探索")).toBe(true);
    expect(isAllowedTool("get_station", "駅情報")).toBe(true);
    expect(isAllowedTool("reserve_ticket", "チケットを予約")).toBe(false);
    expect(isAllowedTool("delete_history")).toBe(false);
    expect(isAllowedTool("do_something")).toBe(false);
  });
  it("respects an explicit allowlist", () => {
    process.env.EKISPERT_ALLOWED_TOOLS = "search_course";
    expect(isAllowedTool("search_course")).toBe(true);
    expect(isAllowedTool("get_station", "駅情報")).toBe(false);
  });
});

describe("redirectBase (Cloud Run では req.url が 0.0.0.0 になる)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const req = (headers: Record<string, string>) => new Request("https://0.0.0.0:8080/api/auth/google", { headers });

  it("uses APP_BASE_URL when set", () => {
    process.env.APP_BASE_URL = "https://oshiready-123.asia-northeast1.run.app/";
    expect(redirectBase(req({ host: "other.a.run.app" }))).toBe("https://oshiready-123.asia-northeast1.run.app");
  });
  it("falls back to the Host header instead of the internal bind address", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(redirectBase(req({ host: "oshiready-abc-an.a.run.app", "x-forwarded-proto": "https" }))).toBe("https://oshiready-abc-an.a.run.app");
  });
});

describe("errorResponse（設定不足）", () => {
  it("SESSION_SECRET が無いときは 503 で返し、利用者には設定名などの技術的な言葉を見せない", async () => {
    const { errorResponse } = await import("@/lib/http");
    const { ConfigError } = await import("@/lib/config");
    const res = errorResponse(new ConfigError("SESSION_SECRET"), { requestId: "r", route: "t" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("CONFIG_MISSING");
    expect(body.error).not.toContain("SESSION_SECRET");
    expect(body.error).toContain("準備がまだ整っていない");
  });
});

describe("readJson（本文の大きさの上限）", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body, headers });

  it("上限以内なら JSON として読む", async () => {
    expect(await readJson(post(JSON.stringify({ a: 1 })), 100)).toEqual({ a: 1 });
  });

  it("Content-Length が上限を超えていたら、読む前に断る", async () => {
    await expect(readJson(post("{}", { "content-length": "999999" }), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("Content-Length を偽っていても、読みながら上限で打ち切る", async () => {
    const big = JSON.stringify({ a: "x".repeat(500) });
    await expect(readJson(post(big, { "content-length": "10" }), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("JSON として読めない本文は undefined（呼び出し側で 400 にする）", async () => {
    expect(await readJson(post("not json"), 100)).toBeUndefined();
  });
});

describe("assertSameOrigin（Origin ヘッダーの検証）", () => {
  const req = (origin: string) => new Request("http://app.example/api", { method: "POST", headers: { origin, host: "app.example" } });

  it("URL として読めない Origin（null など）でもエラーにならず、403 で断る", () => {
    expect(assertSameOrigin(req("null"))?.status).toBe(403);
  });

  it("別のサイトからの操作を断り、同じサイトからは通す", () => {
    expect(assertSameOrigin(req("https://evil.example"))?.status).toBe(403);
    expect(assertSameOrigin(req("https://app.example"))).toBeNull();
  });
});

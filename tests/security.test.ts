import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "@/lib/http";
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

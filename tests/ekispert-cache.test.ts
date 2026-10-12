import { describe, expect, it, vi } from "vitest";

/**
 * 駅すぱあと MCP の道具一覧の取得に失敗したら、しばらく再試行せずにアプリ側の道具だけで進む
 * （失敗のたびに待たせると、プラン作成全体の制限時間を使い切ってしまうため）。
 */
const connect = vi.fn(async () => {
  throw Object.assign(new Error("unauthorized"), { name: "StreamableHTTPError", code: 401 });
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = connect;
    close = vi.fn(async () => undefined);
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {},
}));

process.env.EKISPERT_API_KEY = "test-key";

describe("駅すぱあとの道具一覧の取得", () => {
  it("失敗したら 10 分間は再試行しない", async () => {
    const { getEkispertDeclarations } = await import("@/lib/services/ekispert");
    expect(await getEkispertDeclarations()).toBeNull();
    expect(await getEkispertDeclarations()).toBeNull();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

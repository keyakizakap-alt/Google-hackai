import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 画面に出すエラーの文言に、開発者向けの情報（状態コード・理由の種類・問い合わせ番号・エラーの種類）を混ぜない。
 * 原因はサーバーのログで確かめ、利用者には「次に何をすればよいか」と「データが消えていないこと」を伝える。
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

describe("利用者に見せるエラーの文言", () => {
  it("通信の失敗に、状態コードや理由の種類を付けない", () => {
    const store = read("src/components/store.tsx");
    expect(store).not.toMatch(/（HTTP \$\{/);
    expect(store).not.toMatch(/（理由: /);
  });

  it("エラー画面に、問い合わせ番号やエラーの種類を出さない", () => {
    expect(read("src/app/error.tsx")).not.toContain("error.digest}");
    expect(read("src/app/global-error.tsx")).not.toMatch(/エラーの種類|error\.name/);
  });

  it("AI が調べたことの記録に、開発者向けの言葉を出さない", async () => {
    const { COMPAT_SUMMARY } = await import("@/lib/agent/compat");
    for (const text of Object.values(COMPAT_SUMMARY)) expect(text).not.toMatch(/リクエスト|互換|定義|形式/);
  });
});

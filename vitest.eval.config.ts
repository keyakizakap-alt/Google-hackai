import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 実際の Gemini を呼ぶエージェント評価（npm run eval）。
 * 通常のテスト（npm test）には含めない。費用がかかるため、実行は人が判断する。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["evals/**/*.eval.ts"], testTimeout: 3 * 60 * 60_000, hookTimeout: 60_000 },
});

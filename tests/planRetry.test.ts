import { describe, expect, it } from "vitest";
import { isTransientPlanFailure } from "@/lib/planRetry";

/**
 * 自動で作るプランが失敗したとき、1 回だけ自動でやり直すかどうかの判断。
 * 初回は起動直後や混雑で時間切れになりやすいので、一時的な失敗だけをやり直す（権限・設定の誤りは費用がかかるだけなのでやり直さない）。
 */
describe("自動のプラン作成をやり直してよい失敗", () => {
  it("時間切れ・混雑・通信の切断はやり直す", () => {
    expect(isTransientPlanFailure({})).toBe(true); // 通信が切れて応答がない
    expect(isTransientPlanFailure({ status: 502 })).toBe(true);
    expect(isTransientPlanFailure({ status: 504 })).toBe(true);
    expect(isTransientPlanFailure({ status: 503 })).toBe(true);
    for (const reason of ["DEADLINE_EXCEEDED", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "HTTP_429", "HTTP_503", "TimeoutError", "AbortError"]) {
      expect(isTransientPlanFailure({ status: 503, reason }), reason).toBe(true);
    }
  });

  it("権限・設定・入力の誤りはやり直さない", () => {
    for (const reason of ["IAM_PERMISSION_DENIED", "PERMISSION_DENIED", "SERVICE_DISABLED", "BILLING_DISABLED", "INVALID_ARGUMENT tools[0]", "HTTP_400", "HTTP_403", "NOT_FOUND"]) {
      expect(isTransientPlanFailure({ status: 503, reason }), reason).toBe(false);
    }
  });

  it("入力の誤り・回数制限・上限はやり直さない", () => {
    for (const status of [400, 401, 403, 409, 429, 500]) expect(isTransientPlanFailure({ status }), String(status)).toBe(false);
    expect(isTransientPlanFailure(null)).toBe(false);
  });
});

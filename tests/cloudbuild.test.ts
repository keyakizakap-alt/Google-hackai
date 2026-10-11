import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * cloudbuild.yaml の「守っていること」が、変更で崩れていないかを確かめる（Cloud Build 自体はここでは動かさない）。
 * YAML の解析用の部品は入れず、文字列で検査する。
 */
const raw = readFileSync(new URL("../cloudbuild.yaml", import.meta.url), "utf8");
/** コメント行を除いた本文（説明文の中のフラグ名に反応しないように） */
const yaml = raw.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
const steps = [...yaml.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1]);
/** あるステップの定義部分（次のステップの手前まで） */
const stepBody = (id: string) => {
  const start = yaml.indexOf(`- id: ${id}`);
  const next = yaml.indexOf("- id: ", start + 1);
  return yaml.slice(start, next === -1 ? undefined : next);
};

describe("cloudbuild.yaml", () => {
  it("検査（脆弱性・lint・型・テスト）を通ったものだけをビルドしてデプロイする", () => {
    const order = ["install", "audit", "lint", "typecheck", "test", "build", "push", "deploy-candidate", "smoke-test", "promote"];
    expect(steps).toEqual(order);
  });

  it("イメージにはコミット ID のタグを付ける（どの版かを特定でき、正確に戻せる）", () => {
    expect(stepBody("build")).toContain("${_IMAGE}:${COMMIT_SHA}");
    expect(stepBody("deploy-candidate")).toContain("--image=${_IMAGE}:${COMMIT_SHA}");
  });

  it("新しい版はまず利用者のアクセスを流さずに起動し、起動確認のあとで切り替える", () => {
    expect(stepBody("deploy-candidate")).toContain("--no-traffic");
    expect(stepBody("deploy-candidate")).toContain("--tag=candidate");
    expect(stepBody("smoke-test")).toContain('"sessionSecret") is True');
    expect(stepBody("promote")).toContain("--to-latest");
  });

  it("デプロイで環境変数・シークレット・実行用アカウント・公開設定を変更しない", () => {
    for (const flag of ["--set-env-vars", "--update-env-vars", "--remove-env-vars", "--clear-env-vars", "--set-secrets", "--update-secrets", "--service-account", "--allow-unauthenticated", "--no-allow-unauthenticated"]) {
      expect(yaml, flag).not.toContain(flag);
    }
  });

  it("秘密の値をビルドで扱わず、ログは Cloud Logging にだけ保存する", () => {
    expect(yaml).not.toMatch(/availableSecrets|secretEnv/);
    expect(yaml).toMatch(/logging: CLOUD_LOGGING_ONLY/);
  });

  it("Cloud Run のリージョンとサービス名がアプリの構成と一致している", () => {
    expect(yaml).toMatch(/_REGION: asia-northeast1/);
    expect(yaml).toMatch(/_SERVICE: oshiready/);
  });
});

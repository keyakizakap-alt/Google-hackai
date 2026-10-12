import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * デプロイごとの識別子（バージョンスキュー対策）。
 * 新しい版をデプロイした後に、開いたままの古い画面から移動すると、古い部品を読み込めずにエラーになる。
 * 識別子があると、Next.js が版の違いを検知して自動で読み込み直す（公式の仕組み）。
 * Cloud Build ではコミット ID を渡す。渡されないビルドでは、ビルドした時刻から作る。
 * 環境変数に入れておき、ビルド中の複数のプロセスで同じ値を使う。
 */
const deploymentId = (process.env.NEXT_DEPLOYMENT_ID ||= process.env.DEPLOYMENT_VERSION || process.env.COMMIT_SHA || `b${Date.now().toString(36)}`);

const nextConfig: NextConfig = {
  // Cloud Run 向けに最小構成の server.js を出力する
  output: "standalone",
  deploymentId,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

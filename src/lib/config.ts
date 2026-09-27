import "server-only";

/**
 * 実行時設定。値はすべて環境変数から読み込み、Cloud Run では
 * Secret Manager をマウントして渡すことを想定している。
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * アプリの公開 URL。本番では必ず決まっている必要がある（OAuth の戻り先・同一オリジン判定に使う）。
 * 優先順: APP_BASE_URL → Vercel の本番ドメイン（VERCEL_PROJECT_PRODUCTION_URL）→ 開発時のみ localhost。
 * 本番で決まらない場合は null を返し、呼び出し側で安全側（OAuth を無効化）に倒す。
 */
export function appBaseUrl(): string | null {
  const explicit = env("APP_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = env("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercel) return `https://${vercel}`;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export const config = {
  isProd: process.env.NODE_ENV === "production",

  /** Cookie 暗号化・プラン署名用の鍵素材（32 文字以上を推奨） */
  sessionSecret: env("SESSION_SECRET"),
  /**
   * 入れ替え前の古い値（任意・カンマ区切りで複数可）。
   * 新しい値を SESSION_SECRET に入れ、古い値をここに移すと、使用中の人を締め出さずに安全に入れ替えられる。
   * 入れ替えから 24 時間（Cookie の有効期限）たったら削除してよい。
   */
  sessionSecretPrevious: (env("SESSION_SECRET_PREVIOUS") ?? "").split(",").map((v) => v.trim()).filter(Boolean),

  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
  },

  gemini: {
    /** true なら Gemini Enterprise Agent Platform（旧 Vertex AI）経由で呼び出す */
    useVertex: env("GOOGLE_GENAI_USE_VERTEXAI") === "true",
    apiKey: env("GEMINI_API_KEY"),
    project: env("GOOGLE_CLOUD_PROJECT"),
    location: env("GOOGLE_CLOUD_LOCATION") ?? "global",
    model: env("GEMINI_MODEL") ?? "gemini-3.5-flash",
    maxSteps: Number(env("AGENT_MAX_STEPS") ?? 10),
  },

  /**
   * デモ用カレンダーの ID（例: デモ用アカウントのメールアドレス）。
   * このカレンダーを実行サービスアカウントに「予定の詳細を表示」で共有すると、
   * 利用者はログインなしで「デモのカレンダーで試す」を押すだけで連携の流れを体験できる。
   * 架空の予定だけを入れたデモ専用カレンダーにすること（押した人は全員同じ内容を見る）。
   */
  demoCalendarId: env("DEMO_CALENDAR_ID"),

  ekispert: {
    mcpUrl: env("EKISPERT_MCP_URL") ?? "https://api-mcp.ekispert.jp/mcp",
    accessKey: env("EKISPERT_API_KEY"),
  },

  youcam: {
    apiKey: env("YOUCAM_API_KEY"),
  },
} as const;

export const isGoogleOAuthConfigured = () =>
  Boolean(config.google.clientId && config.google.clientSecret && appBaseUrl());

export const isGeminiConfigured = () =>
  config.gemini.useVertex ? Boolean(config.gemini.project) : Boolean(config.gemini.apiKey);

export const isEkispertConfigured = () => Boolean(config.ekispert.accessKey);

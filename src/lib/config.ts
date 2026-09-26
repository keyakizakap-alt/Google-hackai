import "server-only";

/**
 * 実行時設定。値はすべて環境変数から読み込み、Cloud Run では
 * Secret Manager をマウントして渡すことを想定している。
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const config = {
  appBaseUrl: env("APP_BASE_URL") ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",

  /** Cookie 暗号化・プラン署名用の鍵素材（32 文字以上を推奨） */
  sessionSecret: env("SESSION_SECRET"),

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

  ekispert: {
    mcpUrl: env("EKISPERT_MCP_URL") ?? "https://api-mcp.ekispert.jp/mcp",
    accessKey: env("EKISPERT_API_KEY"),
  },

  youcam: {
    apiKey: env("YOUCAM_API_KEY"),
  },
} as const;

export const isGoogleOAuthConfigured = () =>
  Boolean(config.google.clientId && config.google.clientSecret);

export const isGeminiConfigured = () =>
  config.gemini.useVertex ? Boolean(config.gemini.project) : Boolean(config.gemini.apiKey);

export const isEkispertConfigured = () => Boolean(config.ekispert.accessKey);

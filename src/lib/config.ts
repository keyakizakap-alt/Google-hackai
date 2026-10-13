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

/** サーバーの設定不足（管理者が環境変数を設定すれば直るもの）。値そのものはメッセージに含めない */
export class ConfigError extends Error {
  constructor(readonly setting: string) {
    super(`${setting} is not configured`);
    this.name = "ConfigError";
  }
}

const TOOL_MODES = ["AUTO", "VALIDATED", "ANY"] as const;
function toolMode(v: string | undefined): (typeof TOOL_MODES)[number] {
  const upper = (v ?? "").toUpperCase();
  return (TOOL_MODES as readonly string[]).includes(upper) ? (upper as (typeof TOOL_MODES)[number]) : "AUTO";
}

const THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
function thinkingLevel(v: string | undefined): (typeof THINKING_LEVELS)[number] | undefined {
  if (v === undefined) return "LOW";
  const upper = v.toUpperCase();
  return (THINKING_LEVELS as readonly string[]).includes(upper) ? (upper as (typeof THINKING_LEVELS)[number]) : undefined;
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
    /**
     * 予備のモデル（任意）。メインが混雑・障害・提供終了で使えないときだけ使う。
     * 例: Flash-Lite。未設定なら切り替えない。モデル名は公式ドキュメントで確認したものを入れる
     */
    fallbackModel: env("GEMINI_FALLBACK_MODEL"),
    /**
     * プラン作成で AI が「考える」深さ（MINIMAL / LOW / MEDIUM / HIGH）。既定は LOW。
     * 道具を何度も呼ぶ作りのため、深く考えさせると 1 回ごとの応答が遅くなり、全体の制限時間を超えやすい。
     * 出来は submit_timeline の検証と差し戻しで担保する。空文字（"default"）にするとモデルの既定値を使う
     */
    thinkingLevel: thinkingLevel(env("GEMINI_THINKING_LEVEL")),
    /**
     * 道具（ツール）の使わせ方（AUTO / VALIDATED / ANY）。既定は AUTO（指定を送らない）。
     * 「必ず道具を使う」ANY は、Vertex AI の gemini-3.5-flash で 400 INVALID_ARGUMENT になることを本番で確認したため既定にしない。
     * AUTO でも、最後は提出用の道具だけを渡して提出させ、文章で答えたときは提出を促す
     */
    toolMode: toolMode(env("GEMINI_TOOL_MODE")),
    /**
     * 1 回のプラン作成で AI が道具（ツール）を使える回数。手順が 7 段階あるため最低 8 回は確保する。
     * 残り 2 回になると提出（submit_timeline）だけを許可する。
     */
    maxSteps: Math.max(8, Number(env("AGENT_MAX_STEPS") ?? 12) || 12),
    /**
     * Google 検索によるグラウンディング（実在の店舗・宿・飛行機の便と参考価格を探す）を使うか。既定はオン。
     * 検索 1 回ごとに費用がかかる（公式の料金表で確認）ため、1 回のプラン作成で使える回数を webSearchMaxPerPlan で制限する。
     * "off" で止める（止めると、店舗名・価格を出さない今までの動きに戻る）
     */
    webSearch: env("GEMINI_WEB_SEARCH") !== "off",
    webSearchMaxPerPlan: 3,
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
} as const;

export const isGoogleOAuthConfigured = () =>
  Boolean(config.google.clientId && config.google.clientSecret && appBaseUrl());

export const isGeminiConfigured = () =>
  config.gemini.useVertex ? Boolean(config.gemini.project) : Boolean(config.gemini.apiKey);

export const isEkispertConfigured = () => Boolean(config.ekispert.accessKey);

import "server-only";

/**
 * 構造化ロガー（Cloud Logging 互換の JSON を 1 行で出力）。
 *
 * プライバシー方針:
 * - 出力できるフィールドは ALLOWED_FIELDS の許可リストに限定する。
 *   カレンダーの予定・顔画像・ユーザー入力本文などは型的にも運用的にも出力できない。
 * - 文字列値は長さを制限し、メールアドレス/電話番号らしき値はマスクする。
 */
type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

const ALLOWED_FIELDS = new Set([
  "event",
  "requestId",
  "trace",
  "route",
  "status",
  "fromStatus",
  "toStatus",
  "tool",
  "toolOk",
  "step",
  "steps",
  "latencyMs",
  "model",
  "mode",
  "promptTokens",
  "outputTokens",
  "totalTokens",
  "itemCount",
  "slotCount",
  "busyCount",
  "errorCode",
  "httpStatus",
  "planId",
  "revision",
  "validationErrors",
  "scanned",
  "candidates",
  "weather",
  "cached",
  "spotCount",
]);

export type LogFields = Partial<Record<string, string | number | boolean | undefined>>;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;

function sanitizeValue(v: unknown): string | number | boolean | undefined {
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v !== "string") return undefined;
  return v.replace(EMAIL, "[email]").replace(PHONE, "[phone]").slice(0, 120);
}

export function sanitizeFields(fields: LogFields): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    const s = sanitizeValue(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

function write(severity: Severity, message: string, fields: LogFields = {}) {
  const { trace, ...rest } = fields;
  const entry: Record<string, unknown> = {
    severity,
    message: sanitizeValue(message),
    time: new Date().toISOString(),
    ...sanitizeFields(rest),
  };
  if (typeof trace === "string" && process.env.GOOGLE_CLOUD_PROJECT) {
    entry["logging.googleapis.com/trace"] =
      `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${trace}`;
  }
  const line = JSON.stringify(entry);
  // 標準出力への書き込みはこのモジュールだけに集約する（他所では console.* を使わない）
  if (severity === "ERROR") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (m: string, f?: LogFields) => {
    if (process.env.LOG_LEVEL === "debug") write("DEBUG", m, f);
  },
  info: (m: string, f?: LogFields) => write("INFO", m, f),
  warn: (m: string, f?: LogFields) => write("WARNING", m, f),
  error: (m: string, f?: LogFields) => write("ERROR", m, f),
};

/** Cloud Run が付与する X-Cloud-Trace-Context からトレース ID を取り出す */
export function traceFromRequest(req: Request): string | undefined {
  const h = req.headers.get("x-cloud-trace-context");
  return h ? h.split("/")[0] : undefined;
}

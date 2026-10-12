import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { assertSameOrigin, rateLimit, readJson, requestMeta } from "@/lib/http";

/**
 * 画面で起きたエラー（エラー画面が表示されたとき）を Cloud Logging に残す。原因を後から特定するための記録。
 * 受け取るのはエラーの種類・短い説明・画面のパス・digest だけ。説明は URL を除いて短く切り、メールアドレス等はロガーでも伏せる。
 */
const Body = z.object({
  kind: z.enum(["global", "page"]),
  name: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
  digest: z.string().max(80).optional(),
  path: z.string().max(200).optional(),
  frame: z.string().max(120).optional(),
  version: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "client.error" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "client-error", 10);
  if (denied) return denied;
  const parsed = Body.safeParse(await readJson(req, 4 * 1024).catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { kind, name, message, digest, path, frame, version } = parsed.data;
  const page = (path ?? "").split(/[?#]/)[0];
  logger.warn("client.error", {
    ...meta,
    mode: kind,
    errorCode: /^[\w.$-]{1,60}$/.test(name ?? "") ? name : "Error",
    clientMessage: (message ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim(),
    page: /^\/[\w\-/]{0,60}$/.test(page) ? page : "other",
    digest: /^[\w-]{1,40}$/.test(digest ?? "") ? digest : undefined,
    clientFrame: /^[\w.-]{1,80}\.js:\d+:\d+$/.test(frame ?? "") ? frame : undefined,
    deployment: /^[\w-]{1,40}$/.test(version ?? "") ? version : undefined,
  });
  return NextResponse.json({ ok: true });
}

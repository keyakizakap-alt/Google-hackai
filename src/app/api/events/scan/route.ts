import { NextResponse } from "next/server";
import { z } from "zod";
import { scanForEvents, ScanUnavailableError } from "@/lib/eventDetection/scan";
import { assertSameOrigin, dailyAgentCap, errorResponse, rateLimit, requestMeta } from "@/lib/http";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const Body = z
  .object({
    image: z.string().max(6_000_000).optional(),
    text: z.string().max(3000).optional(),
  })
  .refine((b) => b.image || b.text, "画像か文章が必要です");

/** スクショ／貼り付けた文章からライブ情報を読み取る。保存はしない（結果はユーザーが確認してから登録） */
export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "events.scan" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "scan", 10) ?? dailyAgentCap();
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "画像か文章を入れてください" }, { status: 400 });
    let image: { mime: string; data: Buffer } | undefined;
    if (parsed.data.image) {
      const m = parsed.data.image.match(/^data:(image\/(?:png|jpeg|webp|heic|heif));base64,(.+)$/);
      if (!m) return NextResponse.json({ error: "対応していない画像形式です（PNG・JPEG・WebP）" }, { status: 400 });
      const data = Buffer.from(m[2], "base64");
      if (data.length > MAX_IMAGE_BYTES) return NextResponse.json({ error: "画像が大きすぎます" }, { status: 400 });
      image = { mime: m[1], data };
    }
    const out = await scanForEvents({ image, text: parsed.data.text }, meta.requestId);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof ScanUnavailableError) return NextResponse.json({ error: e.message }, { status: 422 });
    return errorResponse(e, meta);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePlan } from "@/lib/agent/workflow";
import { OshiEventSchema } from "@/lib/agent/types";
import { assertSameOrigin, dailyAgentCap, errorResponse, rateLimit, requestMeta, readJson } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({
  event: OshiEventSchema,
  /** data URL / base64。サーバーはメモリ上でのみ扱い保存しない */
  selfie: z.string().max(6_000_000).optional(),
});

export async function POST(req: Request) {
  const meta = { ...requestMeta(req), route: "agent.plan" };
  const denied = assertSameOrigin(req) ?? rateLimit(req, "agent", 6) ?? dailyAgentCap();
  if (denied) return denied;
  try {
    const parsed = Body.safeParse(await readJson(req, 7 * 1024 * 1024));
    if (!parsed.success) return NextResponse.json({ error: "入力内容を確認してください" }, { status: 400 });
    if (parsed.data.selfie) return NextResponse.json({ error: "肌解析は現在利用できません。写真は送信されていません" }, { status: 400 });
    if (Date.parse(parsed.data.event.startAt) < Date.now()) {
      return NextResponse.json({ error: "イベント日時が過去です" }, { status: 400 });
    }
    const out = await generatePlan({ event: parsed.data.event, selfieBase64: parsed.data.selfie, ...meta });
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e, meta);
  }
}

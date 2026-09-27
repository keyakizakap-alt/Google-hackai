import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/** 死活確認。設定がそろっているかは有無（true/false）だけを返し、値は返さない */
export function GET() {
  return Response.json({ ok: true, config: { sessionSecret: Boolean(config.sessionSecret) } });
}

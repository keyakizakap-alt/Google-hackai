import { createHash } from "node:crypto";
import { redactText } from "../privacy/mask";
import { toJstIso } from "../time";
import { extractByRules, type DetectedLiveEvent } from "./detect";
import { matchVenue } from "./venues";

/**
 * 貼り付けた文章（当選メール・チケット画面のコピー等）からライブ情報をルールで読み取る。
 * AI が使えないときのフォールバック。日付が見つかったブロックだけを候補にする。
 */
const TITLE_HINT = /(公演|ライブ|live|tour|ツアー|コンサート|concert|ファンミ|fan ?meeting|showcase|ショーケース|フェス)/i;

function inferDate(block: string, now: number): { y: number; m: number; d: number } | null {
  const full = block.match(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})/);
  if (full) return { y: +full[1], m: +full[2], d: +full[3] };
  const md = block.match(/(?<![\d/])(\d{1,2})\s*[月/]\s*(\d{1,2})\s*日?/);
  if (!md) return null;
  const m = +md[1];
  const d = +md[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // 年がなければ「今日以降で最も近い日付」とみなす
  const thisYear = new Date(now + 9 * 3_600_000).getUTCFullYear();
  const candidate = Date.parse(`${thisYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T23:59:00+09:00`);
  return { y: candidate < now ? thisYear + 1 : thisYear, m, d };
}

function inferTime(block: string): { h: number; min: number } | null {
  const open = block.match(/開演\s*[:：]?\s*(\d{1,2})\s*[:：時]\s*(\d{2})?/);
  const any = block.match(/(?<!\d)(\d{1,2})\s*[:：]\s*(\d{2})(?!\d)/);
  const t = open ?? any;
  if (!t) return null;
  const h = +t[1];
  const min = t[2] ? +t[2] : 0;
  return h < 24 && min < 60 ? { h, min } : null;
}

export function parseEventsFromText(text: string, now = Date.now()): DetectedLiveEvent[] {
  const clean = redactText(text, 3000);
  const blocks = clean.split(/\n\s*\n|-{3,}|={3,}/).map((b) => b.trim()).filter(Boolean);
  const out: DetectedLiveEvent[] = [];
  for (const block of blocks.length ? blocks : [clean]) {
    const date = inferDate(block, now);
    if (!date) continue;
    const time = inferTime(block);
    const iso = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}T${String(time?.h ?? 18).padStart(2, "0")}:${String(time?.min ?? 0).padStart(2, "0")}:00+09:00`;
    const start = Date.parse(iso);
    if (!Number.isFinite(start) || start < now) continue;

    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const title = (lines.find((l) => TITLE_HINT.test(l)) ?? lines[0] ?? "").replace(/^(公演名|タイトル)\s*[:：]\s*/, "").slice(0, 80);
    const venueLine = lines.find((l) => /^(会場|場所|venue)\s*[:：]/i.test(l))?.replace(/^(会場|場所|venue)\s*[:：]\s*/i, "") ?? "";
    const location = venueLine || matchVenue(block)?.name || "";
    if (!title) continue;

    const ev = extractByRules({
      key: createHash("sha256").update(`scan:${title}:${iso}`).digest("base64url").slice(0, 12),
      summary: title,
      location,
      startAt: toJstIso(start),
      timeUnknown: !time,
    });
    out.push(ev);
  }
  // 同じ公演の重複を除く
  return out.filter((e, i) => out.findIndex((x) => x.key === e.key) === i).slice(0, 10);
}

import "server-only";
import type { LiveCandidate } from "../eventDetection/detect";
import type { BusyBlock } from "../privacy/mask";
import { gateForDetection, sanitizeBusy } from "./gate";
import { googleSource } from "./google";
import { sampleSource } from "./sample";
import type { CalendarSourceAdapter } from "./types";

/**
 * 連携先の一覧（ここに部品を足す／外すだけで連携先を変えられる）。
 * 例: Outlook を足すときは outlookSource を作って配列に加え、CALENDAR_SOURCES=google,outlook にする。
 */
const ALL_SOURCES: CalendarSourceAdapter[] = [googleSource, sampleSource];

/**
 * 環境変数 CALENDAR_SOURCES（カンマ区切り、既定 google,sample）で有効な連携先を切り替える。
 * sample（デモのカレンダー）は DEMO_CALENDAR_ID を設定したときだけ現れる。
 */
export function enabledSources(): CalendarSourceAdapter[] {
  const allow = (process.env.CALENDAR_SOURCES ?? "google,sample").split(",").map((v) => v.trim()).filter(Boolean);
  return ALL_SOURCES.filter((s) => allow.includes(s.id) && s.isAvailable());
}

export async function connectedSources(): Promise<CalendarSourceAdapter[]> {
  const list = enabledSources();
  const flags = await Promise.all(list.map((s) => s.isConnected()));
  return list.filter((_, i) => flags[i]);
}

export async function describeSources() {
  const list = enabledSources();
  const flags = await Promise.all(list.map((s) => s.isConnected()));
  return list.map((s, i) => ({ id: s.id, label: s.label, connectPath: s.connectPath, connected: flags[i] }));
}

/** 連携中のすべてのカレンダーから「埋まっている時間帯」だけを集める */
export async function collectBusy(range: { from: number; to: number }): Promise<{ source: "calendar" | "demo"; sources: string[]; busy: BusyBlock[] }> {
  const connected = await connectedSources();
  if (connected.length === 0) return { source: "demo", sources: [], busy: [] };
  const all = await Promise.all(connected.map((s) => s.fetchBusy(range)));
  return { source: "calendar", sources: connected.map((s) => s.id), busy: sanitizeBusy(all.flat()) };
}

/** 連携中のすべてのカレンダーから、ライブ候補だけを集める（それ以外は各連携先ごとに即破棄） */
export async function collectLiveCandidates(range: { from: number; to: number }): Promise<{ sources: string[]; scanned: number; candidates: LiveCandidate[] }> {
  const connected = await connectedSources();
  let scanned = 0;
  const candidates: LiveCandidate[] = [];
  for (const s of connected) {
    const gated = gateForDetection(await s.fetchItemsForDetection(range));
    scanned += gated.scanned;
    candidates.push(...gated.candidates);
  }
  // 複数の連携先に同じ予定がある場合の重複を除く
  const unique = candidates.filter((c, i) => candidates.findIndex((x) => x.summary === c.summary && x.startAt === c.startAt) === i);
  return { sources: connected.map((s) => s.id), scanned, candidates: unique.slice(0, 20) };
}

export async function disconnectAll(): Promise<void> {
  for (const s of await connectedSources()) await s.disconnect().catch(() => undefined);
}

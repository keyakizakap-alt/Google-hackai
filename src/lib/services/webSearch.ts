import "server-only";
import { config, isGeminiConfigured } from "../config";
import { createGenAI } from "../gemini";
import { logger } from "../logger";
import { buildWebSearchPrompt, WEB_SEARCH_INSTRUCTION } from "../agent/prompt";
import type { WebSearchPurpose, WebSearchRecord } from "../agent/types";

/**
 * Google 検索によるグラウンディング（Gemini の googleSearch ツール）で、実在の店舗・宿・飛行機の便を探す。
 *
 * - プラン作成の AI とは**別の呼び出し**にし、この呼び出しには googleSearch だけを渡す。
 *   Vertex AI のドキュメントに「検索系のツールと関数呼び出しは同じリクエストに入れられない」とあるため（2026-10 時点）。
 * - 検索で根拠（groundingChunks）が見つからなかったときは「見つからなかった」として返し、AI に名前や価格を作らせない。
 * - 検索候補（searchEntryPoint.renderedContent）は表示が必須のため、受け取ったまま返す（画面でそのまま表示する）。
 * - 検索語は利用者の出発駅などを含みうるので、ログには残さない（件数と時間だけ）。
 * - 費用：検索 1 回ごとに課金される（公式の料金表で確認）。回数の上限は呼び出し側（tools.ts）で守る。
 */

const TIMEOUT_MS = 25_000;
const MAX_TEXT = 3000;
const MAX_SOURCES = 8;
const MAX_SUGGESTIONS_HTML = 20_000;

export interface WebSearchOutcome {
  available: boolean;
  record?: WebSearchRecord;
  reason?: string;
}

export const isWebSearchEnabled = () => config.gemini.webSearch && isGeminiConfigured();

export async function searchWeb(purpose: WebSearchPurpose, query: string, opts: { signal?: AbortSignal; requestId?: string } = {}): Promise<WebSearchOutcome> {
  if (!isWebSearchEnabled()) return { available: false, reason: "Google 検索は使えない設定です" };
  const started = Date.now();
  try {
    const ai = createGenAI(TIMEOUT_MS);
    const res = await ai.models.generateContent({
      model: config.gemini.model,
      contents: [{ role: "user", parts: [{ text: buildWebSearchPrompt(purpose, query.slice(0, 120)) }] }],
      config: {
        systemInstruction: WEB_SEARCH_INSTRUCTION,
        tools: [{ googleSearch: {} }],
        abortSignal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const meta = res.candidates?.[0]?.groundingMetadata;
    const sources = (meta?.groundingChunks ?? [])
      .map((c) => ({ title: (c.web?.title ?? "").slice(0, 200), uri: c.web?.uri ?? "" }))
      .filter((s) => /^https:\/\//.test(s.uri) && s.uri.length <= 800)
      .slice(0, MAX_SOURCES);
    const text = (res.text ?? "").trim().slice(0, MAX_TEXT);
    logger.info("agent.web_search", { requestId: opts.requestId, mode: purpose, itemCount: sources.length, latencyMs: Date.now() - started });
    // 根拠のページがない答えは、モデルの記憶で書かれた可能性があるので使わない
    if (sources.length === 0 || !text) return { available: false, reason: "検索で根拠になるページが見つかりませんでした" };
    const html = meta?.searchEntryPoint?.renderedContent;
    return {
      available: true,
      record: {
        purpose,
        text,
        sources,
        suggestionsHtml: html && html.length <= MAX_SUGGESTIONS_HTML ? html : undefined,
        searchedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    logger.warn("agent.web_search.failed", { requestId: opts.requestId, mode: purpose, errorCode: (e as Error).name, httpStatus: (e as { status?: number }).status, latencyMs: Date.now() - started });
    return { available: false, reason: "Google 検索に接続できませんでした" };
  }
}

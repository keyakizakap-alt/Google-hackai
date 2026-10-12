import "server-only";
import { FunctionCallingConfigMode, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";
import { createGenAI, geminiErrorInfo } from "../gemini";
import { logger } from "../logger";
import { toLegacyDeclarations } from "./compat";

/**
 * Gemini がプラン作成の最初の呼び出しを 400（形が正しくない）で拒否し、説明にも項目名が無いときの切り分け。
 * リクエストを部品ごとに小さく分けて順に送り、どの部品を足したときに拒否されるかをログに残す。
 * - 送るのは決まった短い文と、アプリの指示・道具の定義・利用者の依頼文（予定の中身は含まない）
 * - ログに残すのは部品の名前と結果（成否・HTTP の状態・理由の名前）だけ
 * - 費用と負荷を抑えるため、インスタンスごとに 10 分に 1 回まで
 */
const PROBE_INTERVAL_MS = 10 * 60_000;
let lastProbeAt = 0;

export interface ProbeInput {
  requestId: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  declarations: FunctionDeclaration[];
}

interface Probe {
  name: string;
  text: string;
  config: GenerateContentConfig;
}

export async function probeGeminiRequest(input: ProbeInput, now = Date.now()): Promise<void> {
  if (now - lastProbeAt < PROBE_INTERVAL_MS) return;
  lastProbeAt = now;
  const ai = createGenAI(15_000);
  const hello = "「OK」とだけ返してください。";
  const any = { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } };
  const probes: Probe[] = [
    { name: "text_only", text: hello, config: {} },
    { name: "system", text: hello, config: { systemInstruction: input.systemInstruction } },
    { name: "user_prompt", text: input.userPrompt, config: {} },
    { name: "tools_legacy", text: hello, config: { tools: [{ functionDeclarations: toLegacyDeclarations(input.declarations) }] } },
    { name: "tools_json", text: hello, config: { tools: [{ functionDeclarations: input.declarations }] } },
    { name: "tools_any", text: hello, config: { tools: [{ functionDeclarations: input.declarations }], toolConfig: any } },
    {
      name: "full",
      text: input.userPrompt,
      config: { systemInstruction: input.systemInstruction, tools: [{ functionDeclarations: input.declarations }], toolConfig: any },
    },
  ];
  for (const [i, p] of probes.entries()) {
    const started = Date.now();
    try {
      await ai.models.generateContent({ model: input.model, contents: [{ role: "user", parts: [{ text: p.text }] }], config: p.config });
      logger.warn("agent.gemini.probe", { requestId: input.requestId, step: i + 1, mode: p.name, toolOk: true, latencyMs: Date.now() - started, model: input.model });
    } catch (e) {
      logger.warn("agent.gemini.probe", {
        requestId: input.requestId,
        step: i + 1,
        mode: p.name,
        toolOk: false,
        httpStatus: (e as { status?: number }).status,
        ...geminiErrorInfo(e),
        latencyMs: Date.now() - started,
        model: input.model,
      });
    }
  }
}

/** テスト用：間隔の制限を戻す */
export function resetProbeForTest() {
  lastProbeAt = 0;
}

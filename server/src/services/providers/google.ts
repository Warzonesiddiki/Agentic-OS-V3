/**
 * providers/google.ts — Google Gemini (Generative Language) adapter.
 *
 * Gemini's REST API exposes `generateContent` with its own message format
 * (contents[].parts[]). We translate from the gateway's ChatMessage[] here.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

const DEFAULT_MODEL = "gemini-1.5-pro";

export const googleProvider: ProviderAdapter = {
  name: "google",
  capabilities: new Set(["vision", "tools", "1m_context", "json_mode"]),
  models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    if (!opts.apiKey) throw new Error("google_missing_api_key");
    const base = opts.baseUrl ?? "https://generativelanguage.googleapis.com";
    const start = Date.now();
    const model = req.model || DEFAULT_MODEL;

    const contents = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    const genConfig: Record<string, unknown> = {};
    if (req.maxTokens) genConfig.maxOutputTokens = req.maxTokens;
    if (req.temperature !== undefined) genConfig.temperature = req.temperature;
    if (req.stopSequences?.length) genConfig.stopSequences = req.stopSequences;
    if (Object.keys(genConfig).length) body.generationConfig = genConfig;

    const url = `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`google_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      modelVersion?: string;
    };
    const candidate = data.candidates[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      provider: "google",
      model: data.modelVersion ?? model,
      text,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      durationMs: Date.now() - start,
    };
  },
};
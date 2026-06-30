/**
 * providers/m3.ts — M3 / aionrs-side model adapter.
 *
 * M3 is a hypothetical/on-prem "smart" model exposed by the aionrs runtime.
 * It speaks an OpenAI-compatible wire format but lives behind the aionrs
 * agent mesh. Calls route through the local aionr endpoint.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

export const m3Provider: ProviderAdapter = {
  name: "m3",
  capabilities: new Set(["vision", "tools", "1m_context", "json_mode"]),
  models: ["m3-reasoning", "m3-fast", "m3-coder"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    const base = opts.baseUrl ?? process.env.AIONRS_BASE_URL ?? "http://127.0.0.1:7878/v1";
    const start = Date.now();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stop: req.stopSequences,
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
    }
    const resp = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`m3_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      choices: Array<{ message: { content: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model: string;
    };
    const choice = data.choices[0];
    if (!choice) throw new Error("m3_empty_choices");
    return {
      provider: "m3",
      model: data.model,
      text: choice.message.content ?? "",
      toolCalls: choice.message.tool_calls?.map((tc) => ({ name: tc.function.name, args: safeParse(tc.function.arguments) })),
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
      durationMs: Date.now() - start,
    };
  },
};

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return { _raw: s }; }
}
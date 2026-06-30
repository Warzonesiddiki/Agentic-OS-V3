/**
 * providers/openai.ts — OpenAI Chat Completions adapter.
 *
 * Implements the `ProviderAdapter` interface from llm-gateway-v2.ts. Streams
 * via fetch (no SDK dependency — keeps the surface minimal and avoids
 * version drift). Token counts come from the response's `usage` field.
 *
 * Capabilities: vision, tools, json_mode, 1m_context (gpt-4o supports 128k;
 * "1m_context" is a routing hint, not a hard guarantee).
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

const DEFAULT_MODEL = "gpt-4o";

export const openaiProvider: ProviderAdapter = {
  name: "openai",
  capabilities: new Set(["vision", "tools", "json_mode"]),
  models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    if (!opts.apiKey) throw new Error("openai_missing_api_key");
    const base = opts.baseUrl ?? "https://api.openai.com/v1";
    const start = Date.now();
    const body: Record<string, unknown> = {
      model: req.model || DEFAULT_MODEL,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content, name: m.name })),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stop: req.stopSequences,
      stream: false,
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
    }
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`openai_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      choices: Array<{ message: { content: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model: string;
    };
    const choice = data.choices[0];
    if (!choice) throw new Error("openai_empty_choices");
    return {
      provider: "openai",
      model: data.model,
      text: choice.message.content ?? "",
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: safeParse(tc.function.arguments),
      })),
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
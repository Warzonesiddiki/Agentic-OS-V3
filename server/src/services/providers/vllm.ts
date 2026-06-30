/**
 * providers/vllm.ts — vLLM (OpenAI-compatible) adapter.
 *
 * vLLM serves an OpenAI-compatible API, so this adapter is structurally the
 * same as the OpenAI one but with different default base URL and an explicit
 * bearer-key flow that may be enabled in production.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

export const vllmProvider: ProviderAdapter = {
  name: "vllm",
  capabilities: new Set(["tools", "json_mode", "vision"]),
  models: ["meta-llama/Llama-3.1-70B-Instruct", "meta-llama/Llama-3.1-8B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    const base = opts.baseUrl ?? "http://127.0.0.1:8000/v1";
    const start = Date.now();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stop: req.stopSequences,
      stream: false,
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
    }
    const resp = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`vllm_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      choices: Array<{ message: { content: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model: string;
    };
    const choice = data.choices[0];
    if (!choice) throw new Error("vllm_empty_choices");
    return {
      provider: "vllm",
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
/**
 * providers/ollama.ts — Ollama (local) adapter.
 *
 * Ollama exposes an OpenAI-compatible API at /v1/chat/completions when the
 * `OPENAI_COMPAT` env is set, but the native /api/chat endpoint is simpler
 * and avoids the compat layer. We default to native.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

const DEFAULT_MODEL = "llama3.1";

export const ollamaProvider: ProviderAdapter = {
  name: "ollama",
  capabilities: new Set(["json_mode"]), // local models rarely have vision/tools out of the box
  models: ["llama3.1", "llama3.2", "mistral", "mixtral", "qwen2.5", "gemma2", "phi3", "codellama"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    const base = opts.baseUrl ?? "http://127.0.0.1:11434";
    const start = Date.now();
    const body = {
      model: req.model || DEFAULT_MODEL,
      messages: req.messages,
      stream: false,
      options: {
        temperature: req.temperature,
        num_predict: req.maxTokens,
        stop: req.stopSequences,
      },
    };
    const resp = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`ollama_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      message: { content: string; role: string };
      model: string;
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
    };
    return {
      provider: "ollama",
      model: data.model,
      text: data.message.content ?? "",
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      durationMs: data.total_duration ? Math.round(data.total_duration / 1_000_000) : Date.now() - start,
    };
  },
};
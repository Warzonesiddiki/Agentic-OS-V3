/**
 * providers/anthropic.ts — Anthropic Messages API adapter.
 *
 * The Messages API differs from OpenAI in two important ways:
 *   1. system message is a top-level field, not a message role
 *   2. tool_use / tool_result blocks replace tool_calls / tool role messages
 *
 * We translate between the gateway's generic ChatMessage[] and Anthropic's
 * structure here so the rest of the gateway stays provider-agnostic.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../llm-gateway-v2.js";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

export const anthropicProvider: ProviderAdapter = {
  name: "anthropic",
  capabilities: new Set(["vision", "tools"]),
  models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
  async invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse> {
    if (!opts.apiKey) throw new Error("anthropic_missing_api_key");
    const base = opts.baseUrl ?? "https://api.anthropic.com";
    const start = Date.now();

    const systemMsgs = req.messages.filter((m) => m.role === "system");
    const nonSystemMsgs = req.messages.filter((m) => m.role !== "system");
    const system = systemMsgs.map((m) => m.content).join("\n\n") || undefined;

    const body: Record<string, unknown> = {
      model: req.model || DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
      messages: nonSystemMsgs.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })),
    };
    if (system) body.system = system;
    if (req.stopSequences?.length) body.stop_sequences = req.stopSequences;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema }));
    }

    const resp = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`anthropic_${resp.status}:${text.slice(0, 256)}`);
    }
    const data = await resp.json() as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model: string;
    };
    const textBlock = data.content.find((b) => b.type === "text");
    const toolBlocks = data.content.filter((b) => b.type === "tool_use");
    return {
      provider: "anthropic",
      model: data.model,
      text: textBlock?.text ?? "",
      toolCalls: toolBlocks.map((tb) => ({ name: tb.name ?? "tool", args: tb.input ?? {} })),
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      durationMs: Date.now() - start,
    };
  },
};
/**
 * vlm.ts — Vision-Language Model Integration.
 * Extends the existing LLM provider with image input support for
 * visual understanding and desktop GUI actuation.
 */

import { getEnv, llmConfigured } from "../lib/env.js";
import { safeFetch } from "../lib/http.js";
import { log } from "../lib/logging.js";

export function vlmConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.NEXUS_LLM_BASE_URL && e.NEXUS_LLM_API_KEY && e.NEXUS_LLM_MODEL);
}

export interface VLMRequest {
  prompt: string;
  imageBase64: string;
  maxTokens?: number;
}

export interface VLMResponse {
  content: string;
  model: string;
  usage: { prompt: number; completion: number; total: number };
}

/**
 * Send a prompt + screenshot to the configured LLM provider.
 * Uses the OpenAI-compatible chat completions endpoint with
 * multimodal content (text + image_url).
 */
export async function callVLM(req: VLMRequest): Promise<VLMResponse> {
  if (!vlmConfigured()) {
    throw new Error("VLM provider not configured. Set NEXUS_LLM_BASE_URL, NEXUS_LLM_API_KEY, and NEXUS_LLM_MODEL.");
  }

  const env = getEnv();
  const model = env.NEXUS_LLM_MODEL;
  const url = `${env.NEXUS_LLM_BASE_URL}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.NEXUS_LLM_API_KEY}`,
  };

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: req.prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${req.imageBase64}` },
          },
        ],
      },
    ],
    max_tokens: req.maxTokens ?? 2048,
    temperature: 0.1,
  };

  const response = await safeFetch(url, {
    method: "POST",
    timeoutMs: 120_000,
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = response.body && typeof response.body === "object"
      ? JSON.stringify(response.body).slice(0, 500)
      : String(response.body ?? "unknown").slice(0, 500);
    throw new Error(`VLM request failed (${response.status}): ${errBody}`);
  }

  const data = response.body as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? env.NEXUS_LLM_MODEL,
    usage: {
      prompt: data.usage?.prompt_tokens ?? 0,
      completion: data.usage?.completion_tokens ?? 0,
      total: data.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Parse a VLM action response into structured desktop actions.
 * The VLM returns actions as JSON lines:
 *   {"action": "click", "x": 100, "y": 200}
 *   {"action": "type", "text": "Hello world"}
 *   {"action": "scroll", "direction": "down", "amount": 3}
 *   {"action": "keypress", "key": "enter"}
 *   {"action": "screenshot"}
 *   {"action": "done", "summary": "Task completed"}
 */
export interface DesktopAction {
  action: "click" | "type" | "scroll" | "keypress" | "screenshot" | "done";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  summary?: string;
}

export function parseDesktopActions(vlmResponse: string): DesktopAction[] {
  const actions: DesktopAction[] = [];
  const lines = vlmResponse.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    try {
      const parsed = JSON.parse(trimmed) as DesktopAction;
      if (parsed.action) {
        actions.push(parsed);
      }
    } catch {
      // Skip non-JSON lines (explanatory text from the VLM)
    }
  }
  return actions;
}

/**
 * services/llm.ts — LLM Provider Service.
 *
 * Generic OpenAI-compatible provider for:
 *   - Session transcript distillation (replaces heuristicDistill)
 *   - Interactive agent prompts
 *   - Structured data extraction
 *
 * Gracefully degrades when no provider is configured.
 */
import { getEnv, llmConfigured } from "../lib/env.js";
import { safeFetch } from "../lib/http.js";
import { log } from "../lib/logging.js";


export { llmConfigured };

// ── Types ─────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { prompt: number; completion: number; total: number };
}

export interface DistilledMemory {
  kind: "episodic" | "semantic" | "preference" | "reflexion" | "fact";
  title: string;
  content: string;
  tags: string[];
  importance: number;
}

// ── Core LLM Call ─────────────────────────────────────────────

export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  if (!llmConfigured()) {
    throw new Error("LLM provider not configured. Set NEXUS_LLM_BASE_URL, NEXUS_LLM_API_KEY, and NEXUS_LLM_MODEL.");
  }

  const env = getEnv();
  const model = env.NEXUS_LLM_MODEL;
  const url = `${env.NEXUS_LLM_BASE_URL}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.NEXUS_LLM_API_KEY}`,
  };
  if (model.startsWith("claude")) {
    headers["anthropic-beta"] = "prompt-caching-2024-07-31";
  }

  const body = {
    model,
    messages: req.messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
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
    throw new Error(`LLM request failed (${response.status}): ${errBody}`);
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

export type StreamChunkCallback = (chunk: { text: string; index: number; finishReason?: string }) => void;

export async function callLLMStream(
  req: LLMRequest,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<LLMResponse> {
  if (!llmConfigured()) {
    throw new Error("LLM provider not configured. Set NEXUS_LLM_BASE_URL, NEXUS_LLM_API_KEY, and NEXUS_LLM_MODEL.");
  }

  const env = getEnv();
  const model = env.NEXUS_LLM_MODEL;
  const url = `${env.NEXUS_LLM_BASE_URL}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.NEXUS_LLM_API_KEY}`,
  };
  if (model.startsWith("claude")) {
    headers["anthropic-beta"] = "prompt-caching-2024-07-31";
  }

  const body = {
    model,
    messages: req.messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
    stream: true,
  };

  const httpResp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!httpResp.ok) {
    const errText = await httpResp.text().catch(() => "unknown");
    throw new Error(`LLM stream request failed (${httpResp.status}): ${errText.slice(0, 500)}`);
  }

  const reader = httpResp.body?.getReader();
  if (!reader) throw new Error("LLM response body is not readable");

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";
  let usage = { prompt: 0, completion: 0, total: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
              index: number;
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };

          if (parsed.usage) {
            usage = {
              prompt: parsed.usage.prompt_tokens ?? 0,
              completion: parsed.usage.completion_tokens ?? 0,
              total: parsed.usage.total_tokens ?? 0,
            };
          }

          for (const choice of parsed.choices ?? []) {
            const delta = choice.delta?.content ?? "";
            if (delta) {
              fullContent += delta;
              onChunk({ text: delta, index: choice.index, finishReason: choice.finish_reason ?? undefined });
            }
          }
        } catch {
          // Skip malformed JSON chunks (e.g., "[DONE]")
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    model,
    usage,
  };
}

// ── Structured Output ─────────────────────────────────────────

/**
 * Call LLM with a JSON schema constraint via system prompt.
 * The LLM is instructed to respond with valid JSON matching the schema.
 */
export async function callLLMStructured<T>(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  const result = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    signal,
  });

  const jsonStr = extractJSON(result.content);
  return JSON.parse(jsonStr) as T;
}

function extractJSON(text: string): string {
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch && codeMatch[1]) return codeMatch[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text;
}

// ── Session Distillation ──────────────────────────────────────

const DISTILL_SYSTEM_PROMPT = `You are a memory distillation engine. Analyze the transcript below and extract distinct memories.
For each distinct memory, output a JSON object with these fields:
- "kind": one of "episodic" (an event that happened), "semantic" (a fact or piece of knowledge), "preference" (a personal preference or habit), "reflexion" (an insight or lesson learned), "fact" (objective verifiable fact)
- "title": a short, descriptive title (max 80 chars)
- "content": the full memory content (max 2000 chars)
- "tags": an array of 1-5 relevant tags
- "importance": a number from 0.0 to 1.0 (1.0 = most important)

Rules:
1. Extract ONLY meaningful information — skip filler, greetings, small talk
2. If nothing meaningful is found, return an empty array
3. A single transcript may contain MULTIPLE distinct memories
4. Output valid JSON ONLY: { "memories": [ ... ] }
5. Do NOT wrap in markdown code blocks — return raw JSON`;

export async function distillTranscript(transcript: string): Promise<DistilledMemory[]> {
  if (!llmConfigured()) {
    // Fall back to heuristic extraction
    return heuristicDistill(transcript);
  }

  try {
    const truncated = transcript.slice(0, 24_000);
    const result = await callLLMStructured<{ memories: DistilledMemory[] }>(
      DISTILL_SYSTEM_PROMPT,
      `Transcript:\n\n${truncated}`,
    );
    const memories = (result?.memories ?? []).slice(0, 25);
    if (memories.length === 0) {
      return [{
        kind: "episodic",
        title: "Session summary",
        content: truncated.slice(0, 600),
        tags: ["session"],
        importance: 0.4,
      }];
    }
    return memories;
  } catch (e) {
    log.warn("distill_llm_failed", { error: e instanceof Error ? e.message : String(e) });
    return heuristicDistill(transcript);
  }
}

// ── Heuristic Fallback ────────────────────────────────────────

function heuristicDistill(transcript: string): DistilledMemory[] {
  const SIGNAL = /\b(remember|note|decided|lesson|learned|always|never|rule|policy|important|fact|preference|todo|fix)\b/i;
  const out: DistilledMemory[] = [];
  for (const line of transcript.split(/\n|(?<=[.!?])\s+/).map((l) => l.trim())) {
    if (line.length <= 8 || !SIGNAL.test(line)) continue;
    out.push({
      kind: /prefer|always|never|policy|rule/i.test(line) ? "preference" : "reflexion",
      title: line.slice(0, 80),
      content: line,
      tags: [],
      importance: 0.6,
    });
  }
  if (!out.length) out.push({ kind: "episodic", title: "Session summary", content: transcript.slice(0, 600), tags: [], importance: 0.4 });
  return out;
}

// ── Agent Chat ────────────────────────────────────────────────

export async function agentChat(
  query: string,
  context: string,
  agentName: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are ${agentName}, an autonomous AI agent in the NEXUS multi-agent system.
Use the provided context to answer accurately. If context is insufficient, say so.

Context:
${context.slice(0, 32_000)}`,
      },
      { role: "user", content: query },
    ],
    temperature: 0.7,
    signal,
  });
  return result.content;
}

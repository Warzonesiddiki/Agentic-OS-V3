# 09 — LLM Client (Real Intelligence)
## NEXUS V3 — LLM API Integration, Routing, Trajectory Logging

> **Replaces the regex heuristic with real LLM calls.**
> **Implements:** OpenAI-compatible API client, trajectory logging, dynamic model routing, provider fallback.

---

## Complete Code: `server/src/services/llm-client.ts`

```typescript
// server/src/services/llm-client.ts
import { safeFetch } from "../lib/http.js";
import { getEnv, llmConfigured } from "../lib/env.js";
import { logTrajectory } from "./audit-engine.js";
import { log } from "../lib/logging.js";
import { withCircuitBreaker } from "./operations-ext.js";
import { validateWithRetry } from "./operations-ext.js";
import type { z } from "zod";

export interface LLMCallOptions {
  agentId: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  actor: string;
}

export interface LLMCallResult {
  content: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  latencyMs: number;
  model: string;
}

/**
 * Call an OpenAI-compatible LLM API.
 * - Retries up to 3 times with exponential backoff
 * - Logs full trajectory to trajectory_logs
 * - Wrapped in circuit breaker
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  if (!llmConfigured()) {
    throw new Error("LLM not configured — set NEXUS_LLM_BASE_URL, NEXUS_LLM_API_KEY, NEXUS_LLM_MODEL");
  }

  return withCircuitBreaker("llm-call", async () => {
    const e = getEnv();
    const model = options.model ?? e.NEXUS_LLM_MODEL;
    const maxRetries = e.NEXUS_MAX_RETRIES;
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await safeFetch(`${e.NEXUS_LLM_BASE_URL}/chat/completions`, {
          method: "POST",
          timeoutMs: 30_000,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${e.NEXUS_LLM_API_KEY}`,
            // Prompt caching for Anthropic
            ...(e.NEXUS_LLM_BASE_URL.includes("anthropic") && {
              "anthropic-beta": "prompt-caching-2024-07-31",
            }),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: options.systemPrompt },
              { role: "user", content: options.userPrompt },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2000,
          }),
        });

        if (!result.ok) {
          throw new Error(`LLM API returned ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`);
        }

        const body = result.body as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const content = body.choices?.[0]?.message?.content ?? "";
        if (!content) throw new Error("LLM API returned empty content");

        const tokensUsed = {
          prompt: body.usage?.prompt_tokens ?? 0,
          completion: body.usage?.completion_tokens ?? 0,
          total: body.usage?.total_tokens ?? 0,
        };
        const latencyMs = Date.now() - startTime;

        // Log trajectory
        await logTrajectory({
          agentId: options.agentId,
          model,
          promptSent: options.userPrompt.slice(0, 10000),
          responseReceived: content.slice(0, 10000),
          tokenUsage: tokensUsed,
          latencyMs,
        }, options.actor);

        return { content, tokensUsed, latencyMs, model };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.warn("llm_call_retry", { attempt, error: lastError.message });
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw new Error(`LLM call failed after ${maxRetries} attempts: ${lastError?.message}`);
  });
}

/**
 * Call LLM and parse JSON output.
 * Uses Zod auto-correction to fix malformed output.
 */
export async function callLLMForJSON<T>(
  options: LLMCallOptions,
  schema: z.ZodType<T>,
): Promise<{ data: T; raw: LLMCallResult }> {
  const raw = await callLLM(options);

  let parsed: unknown;
  try {
    const jsonMatch = raw.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw.content);
  } catch { parsed = null; }

  const result = await validateWithRetry(schema, parsed, 3, async (error) => {
    const retryRaw = await callLLM({
      ...options,
      userPrompt: `${options.userPrompt}\n\nPrevious attempt failed validation:\n${error}\n\nPlease fix and return valid JSON.`,
    });
    try {
      const jsonMatch = retryRaw.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(retryRaw.content);
    } catch { return null; }
  });

  if (!result.success) {
    throw new Error(`LLM output validation failed: ${result.error}`);
  }
  return { data: result.data!, raw };
}
```

---

## Complete Code: `server/src/services/llm-router.ts`

```typescript
// server/src/services/llm-router.ts
import { getEnv } from "../lib/env.js";

export type ModelTier = "cheap" | "flagship";

interface RoutingRule { pattern: string; tier: ModelTier; }

const DEFAULT_RULES: RoutingRule[] = [
  { pattern: "research|analyze|architect|design|debug|review", tier: "flagship" },
  { pattern: "parse|format|extract|summarize|classify|route", tier: "cheap" },
  { pattern: ".*", tier: "flagship" },
];

export function routeModel(taskLabel: string, taskKind: string, inputLength: number): ModelTier {
  if (taskKind === "background" || taskKind === "maintenance") return "cheap";
  if (inputLength < 500) return "cheap";
  for (const rule of DEFAULT_RULES) {
    if (new RegExp(rule.pattern, "i").test(taskLabel)) return rule.tier;
  }
  return "flagship";
}

export function getModelForTier(tier: ModelTier): string {
  const e = getEnv();
  return tier === "cheap" ? (e.NEXUS_EMBEDDING_MODEL || e.NEXUS_LLM_MODEL) : e.NEXUS_LLM_MODEL;
}
```

---

## Real Session Distillation (replaces heuristicDistill)

In `server/src/services.ts`, replace `heuristicDistill` calls:

```typescript
// Add import:
import { callLLMForJSON } from "./services/llm-client.js";
import { routeModel, getModelForTier } from "./services/llm-router.js";
import { z } from "zod";

async function distillWithLLM(transcript: string, actor: string) {
  const tier = routeModel("distill session", "background", transcript.length);
  const model = getModelForTier(tier);

  const systemPrompt = `You are a memory distillation engine. Extract durable, reusable knowledge.
Return JSON: {"memories": [{"kind": "fact|preference|reflexion|semantic|episodic", "title": "concise", "content": "full detail", "tags": ["tag"], "importance": 0.0-1.0}]}
Focus on: decisions, preferences, lessons, pitfalls, architecture facts.
Ignore: casual talk, temporary context.`;

  const schema = z.object({
    memories: z.array(z.object({
      kind: z.enum(["episodic", "semantic", "preference", "reflexion", "fact"]),
      title: z.string().min(1).max(200),
      content: z.string().min(1),
      tags: z.array(z.string()).default([]),
      importance: z.number().min(0).max(1).default(0.5),
    })).default([]),
  });

  try {
    const { data } = await callLLMForJSON({
      agentId: "distiller",
      systemPrompt,
      userPrompt: transcript.slice(0, 8000),
      model,
      temperature: 0.3,
      maxTokens: 2000,
      actor,
    }, schema);
    return data.memories;
  } catch (e) {
    log.warn("llm_distill_fallback", { error: e instanceof Error ? e.message : String(e) });
    return heuristicDistill(transcript); // Fallback to regex
  }
}
```

---

## Success Checklist

```
[ ] callLLM makes real HTTP request to LLM API
[ ] Retry with exponential backoff (1s, 2s, 4s)
[ ] Trajectory logged for every LLM call
[ ] Circuit breaker wraps LLM calls
[ ] callLLMForJSON uses Zod auto-correction
[ ] Dynamic routing: simple tasks → cheap model, complex → flagship
[ ] Prompt caching headers sent for Anthropic
[ ] Session distillation uses LLM when configured, regex as fallback
[ ] All configurable via env (model, temperature, maxTokens, retries)
```

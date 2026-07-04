/**
 * llm-gateway-v2.ts
 * ────────────────
 * Pillar IV of the 100× upgrade.
 *
 * Multi-provider LLM gateway with circuit breakers, token budgets, and a
 * routing policy that picks the cheapest available provider that satisfies
 * the request's capability requirements (vision, tools, 1M context).
 *
 * Provider adapters live in `providers/<name>.ts`. The gateway here is the
 * single dispatch surface; every caller goes through it (no direct OpenAI
 * calls from anywhere else in the codebase).
 *
 * Failure model: circuit breaker per provider. After `failureThreshold`
 * consecutive failures, the breaker opens for `openMs`, during which calls
 * short-circuit. After openMs, half-open: one trial call decides.
 *
 * Budget model: per-session token budget with hard kill switch. If
 * `used >= budget`, requests are denied. Budgets auto-expire.
 */

import { db } from '../db/client.js';
import { llmProviderHealth, llmTokenBudgets } from '../db/client.js';
import { eq, sql } from 'drizzle-orm';
import { appendAudit } from '../lib/audit.js';
import { log } from '../lib/logging.js';
import { env } from '../lib/env.js';
import {
  resolveOmniRoute,
  recordProviderSuccess,
  recordProviderFailure,
  is5xxOrTransientError,
  isProviderHealthy,
} from './omniroute-bridge.js';

/* ─── Provider contract ──────────────────────────────────────────────────── */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ProviderRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  stream?: boolean;
  tools?: Array<{ name: string; description: string; jsonSchema: unknown }>;
  /** Required provider capabilities. */
  requires?: Array<'vision' | 'tools' | '1m_context' | 'json_mode'>;
}

export interface ProviderResponse {
  provider: string;
  model: string;
  text: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: Set<'vision' | 'tools' | '1m_context' | 'json_mode'>;
  readonly models: string[]; // e.g. ["gpt-4o", "gpt-4o-mini"]
  invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse>;
}

/* ─── Provider registry ──────────────────────────────────────────────────── */

import { openaiProvider } from './providers/openai.js';
import { anthropicProvider } from './providers/anthropic.js';
import { googleProvider } from './providers/google.js';
import { ollamaProvider } from './providers/ollama.js';
import { vllmProvider } from './providers/vllm.js';
import { m3Provider } from './providers/m3.js';
import {
  portkeyBridge,
  portkeyOpenAIProvider,
  portkeyAnthropicProvider,
  portkeyGeminiProvider,
  portkeyGroqProvider,
  portkeyMistralProvider,
  portkeyAzureProvider,
  streamPortkeyBridge,
} from './portkey-bridge.js';

const REGISTRY: Record<string, ProviderAdapter> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  ollama: ollamaProvider,
  vllm: vllmProvider,
  m3: m3Provider,
  portkey: portkeyBridge,
  'portkey-openai': portkeyOpenAIProvider,
  'portkey-anthropic': portkeyAnthropicProvider,
  'portkey-gemini': portkeyGeminiProvider,
  groq: portkeyGroqProvider,
  'portkey-groq': portkeyGroqProvider,
  mistral: portkeyMistralProvider,
  'portkey-mistral': portkeyMistralProvider,
  azure: portkeyAzureProvider,
  'portkey-azure': portkeyAzureProvider,
};

export function listProviders(): ProviderAdapter[] {
  return Object.values(REGISTRY);
}

/* ─── Routing ────────────────────────────────────────────────────────────── */

export interface RoutingPolicy {
  /** Ordered list of provider preferences. Earlier = preferred if healthy. */
  preferred: string[];
  /** Optional override per request: force a specific provider. */
  force?: string;
  /** Required capability mask — pick the first provider that has all of them. */
  requires?: ProviderRequest['requires'];
}

export function pickProvider(
  model: string,
  policy: RoutingPolicy
): { adapter: ProviderAdapter; apiKey?: string } | null {
  if (policy.force && REGISTRY[policy.force]) {
    return { adapter: REGISTRY[policy.force]!, apiKey: apiKeyFor(policy.force) };
  }
  for (const name of policy.preferred) {
    const adapter = REGISTRY[name];
    if (!adapter) continue;
    if (!adapter.models.includes(model)) continue;
    if (policy.requires?.length) {
      const missing = policy.requires.filter((r) => !adapter.capabilities.has(r));
      if (missing.length) continue;
    }
    return { adapter, apiKey: apiKeyFor(name) };
  }
  return null;
}

function apiKeyFor(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return env.OPENAI_API_KEY || void 0;
    case 'anthropic':
      return env.ANTHROPIC_API_KEY || void 0;
    case 'google':
    case 'gemini':
    case 'portkey-gemini':
      return env.GOOGLE_API_KEY || env.PORTKEY_API_KEY || void 0;
    case 'ollama':
      return undefined;
    case 'vllm':
      return env.VLLM_API_KEY || void 0;
    case 'm3':
      return env.M3_API_KEY || void 0;
    case 'portkey':
      return env.PORTKEY_API_KEY || void 0;
    case 'portkey-openai':
      return env.OPENAI_API_KEY || env.PORTKEY_API_KEY || void 0;
    case 'portkey-anthropic':
      return env.ANTHROPIC_API_KEY || env.PORTKEY_API_KEY || void 0;
    case 'groq':
    case 'portkey-groq':
      return env.GROQ_API_KEY || env.PORTKEY_API_KEY || void 0;
    case 'mistral':
    case 'portkey-mistral':
      return env.MISTRAL_API_KEY || env.PORTKEY_API_KEY || void 0;
    case 'azure':
    case 'portkey-azure':
      return env.AZURE_OPENAI_API_KEY || env.PORTKEY_API_KEY || void 0;
    default:
      return undefined;
  }
}

/* ─── Circuit breaker ────────────────────────────────────────────────────── */

interface BreakerState {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  successCount: number;
  openedAt: number | null;
  p95Ms: number;
}

const BREAKER_CONFIG = {
  failureThreshold: 5,
  successThreshold: 3,
  openMs: 30_000,
};

const breakers = new Map<string, BreakerState>();

function getBreaker(provider: string): BreakerState {
  let b = breakers.get(provider);
  if (!b) {
    b = { state: 'closed', failureCount: 0, successCount: 0, openedAt: null, p95Ms: 0 };
    breakers.set(provider, b);
  }
  return b;
}

async function recordSuccess(provider: string, durationMs: number): Promise<void> {
  const b = getBreaker(provider);
  b.successCount++;
  b.failureCount = 0;
  // rolling p95 estimate
  b.p95Ms = b.p95Ms === 0 ? durationMs : b.p95Ms * 0.95 + durationMs * 0.05;
  if (b.state === 'half_open' && b.successCount >= BREAKER_CONFIG.successThreshold) {
    b.state = 'closed';
    b.openedAt = null;
    await persistBreaker(provider, b);
    log.info('llm.breaker_closed', { provider });
  } else {
    await persistBreaker(provider, b);
  }
}

async function recordFailure(provider: string): Promise<void> {
  const b = getBreaker(provider);
  b.failureCount++;
  if (b.state === 'half_open' || b.failureCount >= BREAKER_CONFIG.failureThreshold) {
    b.state = 'open';
    b.openedAt = Date.now();
    log.warn('llm.breaker_opened', { provider, failureCount: b.failureCount });
  }
  await persistBreaker(provider, b);
}

async function persistBreaker(provider: string, b: BreakerState): Promise<void> {
  await db
    .insert(llmProviderHealth)
    .values({
      provider,
      state: b.state,
      failureCount: b.failureCount,
      successCount: b.successCount,
      p95Ms: b.p95Ms,
      lastFailureAt: b.failureCount > 0 ? new Date() : null,
      lastSuccessAt: b.successCount > 0 ? new Date() : null,
      openedAt: b.openedAt ? new Date(b.openedAt) : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: llmProviderHealth.provider,
      set: {
        state: b.state,
        failureCount: b.failureCount,
        successCount: b.successCount,
        p95Ms: b.p95Ms,
        updatedAt: new Date(),
      },
    });
}

export async function canCallProvider(provider: string): Promise<boolean> {
  const b = getBreaker(provider);
  if (b.state === 'closed' || b.state === 'half_open') return true;
  if (b.openedAt && Date.now() - b.openedAt >= BREAKER_CONFIG.openMs) {
    b.state = 'half_open';
    b.successCount = 0;
    await persistBreaker(provider, b);
    log.info('llm.breaker_half_open', { provider });
    return true;
  }
  return false;
}

export async function getBreakerSnapshot(): Promise<
  Record<string, { state: string; p95Ms: number; failureCount: number }>
> {
  const rows = await db.query.llmProviderHealth.findMany();
  const out: Record<string, { state: string; p95Ms: number; failureCount: number }> = {};
  for (const r of rows)
    out[r.provider] = { state: r.state, p95Ms: r.p95Ms, failureCount: r.failureCount };
  return out;
}

/* ─── Token budgets ──────────────────────────────────────────────────────── */

export async function setBudget(opts: {
  sessionId: string;
  budget: number;
  expiresAt?: Date;
}): Promise<void> {
  await db
    .insert(llmTokenBudgets)
    .values({
      sessionId: opts.sessionId,
      budget: opts.budget,
      used: 0,
      hardKill: false,
      reason: null,
      expiresAt: opts.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: llmTokenBudgets.sessionId,
      set: { budget: opts.budget, expiresAt: opts.expiresAt ?? null, updatedAt: new Date() },
    });
}

export async function killSession(sessionId: string, reason: string): Promise<void> {
  await db
    .update(llmTokenBudgets)
    .set({ hardKill: true, reason, updatedAt: new Date() })
    .where(eq(llmTokenBudgets.sessionId, sessionId));
  await appendAudit('llm.session_killed', { sessionId, reason }, 'llm-gateway');
}

export async function getBudget(
  sessionId: string
): Promise<{ budget: number; used: number; hardKill: boolean; expiresAt: Date | null } | null> {
  const row = await db.query.llmTokenBudgets.findFirst({
    where: eq(llmTokenBudgets.sessionId, sessionId),
  });
  if (!row) return null;
  return { budget: row.budget, used: row.used, hardKill: row.hardKill, expiresAt: row.expiresAt };
}

export async function chargeBudget(
  sessionId: string,
  tokens: number
): Promise<{ allowed: boolean; reason?: string; remaining: number }> {
  const row = await db.query.llmTokenBudgets.findFirst({
    where: eq(llmTokenBudgets.sessionId, sessionId),
  });
  if (!row) {
    // No budget set → create a default 100k budget
    await setBudget({ sessionId, budget: 100_000 });
    return { allowed: true, remaining: 100_000 };
  }
  if (row.hardKill) return { allowed: false, reason: row.reason ?? 'hard_kill', remaining: 0 };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now())
    return { allowed: false, reason: 'budget_expired', remaining: 0 };
  if (row.used + tokens > row.budget)
    return { allowed: false, reason: 'budget_exceeded', remaining: row.budget - row.used };
  await db
    .update(llmTokenBudgets)
    .set({ used: sql`${llmTokenBudgets.used} + ${tokens}`, updatedAt: new Date() })
    .where(eq(llmTokenBudgets.sessionId, sessionId));
  return { allowed: true, remaining: row.budget - row.used - tokens };
}

/* ─── Gateway dispatch (the public entry point) ────────────────────────── */

export interface GatewayCall {
  sessionId: string; // budget key
  policy: RoutingPolicy;
  request: ProviderRequest;
}

export async function callLLMGateway(call: GatewayCall): Promise<ProviderResponse> {
  // 1. OmniRoute Decision Engine (< 5ms evaluation overhead guarantee)
  const decision = resolveOmniRoute(call.request, call.policy);

  if (decision.evaluationTimeMs > 5) {
    log.warn('omniroute.eval_overhead_exceeded', { evaluationTimeMs: decision.evaluationTimeMs });
  } else {
    log.info('omniroute.decision', {
      complexity: decision.complexity,
      chosenProvider: decision.chosenProvider,
      chosenModel: decision.chosenModel,
      evaluationTimeMs: decision.evaluationTimeMs,
    });
  }

  // 2. Budget check (estimate tokens and pre-charge session budget)
  const estTokens = estimateTokens(call.request);
  const charge = await chargeBudget(call.sessionId, estTokens);
  if (!charge.allowed) {
    await appendAudit(
      'llm.budget_denied',
      { sessionId: call.sessionId, reason: charge.reason },
      'llm-gateway'
    );
    throw new Error(`budget_denied:${charge.reason}`);
  }

  // 3. Assemble candidate provider & model failover chain
  let candidates: Array<{ provider: string; model: string }> = [];

  if (call.policy.force && REGISTRY[call.policy.force]) {
    candidates.push({ provider: call.policy.force, model: call.request.model });
  } else {
    // Primary chain from OmniRoute complexity & cost decision
    candidates = decision.fallbackChain.map((c) => ({ provider: c.provider, model: c.model }));

    // Prepend standard picked provider if explicitly configured
    const standardPicked = pickProvider(call.request.model, call.policy);
    if (standardPicked && !candidates.some((c) => c.provider === standardPicked.adapter.name)) {
      candidates.unshift({ provider: standardPicked.adapter.name, model: call.request.model });
    }
  }

  if (candidates.length === 0) {
    await appendAudit(
      'llm.no_provider',
      { model: call.request.model, policy: call.policy },
      'llm-gateway'
    );
    throw new Error(`no_provider_for_model:${call.request.model}`);
  }

  let lastError: unknown = null;

  // 4. Dynamic Fallback Execution Loop
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const adapter = REGISTRY[candidate.provider];
    if (!adapter) continue;

    const breakerAllowed = await canCallProvider(candidate.provider);
    const healthAllowed = isProviderHealthy(candidate.provider);

    if (!breakerAllowed || !healthAllowed) {
      await appendAudit('llm.circuit_open', { provider: candidate.provider }, 'llm-gateway');
      log.warn('omniroute.provider_bypassed', {
        provider: candidate.provider,
        breakerAllowed,
        healthAllowed,
      });
      continue;
    }

    const apiKey = apiKeyFor(candidate.provider);
    const candidateReq: ProviderRequest = {
      ...call.request,
      model: candidate.model,
    };

    try {
      const resp = await adapter.invoke(candidateReq, {
        apiKey,
        baseUrl:
          String(
            (env as Record<string, unknown>)[`${candidate.provider.toUpperCase()}_BASE_URL`] ?? ''
          ) || void 0,
      });

      // Record success in circuit breaker & OmniRoute health registry
      await recordSuccess(candidate.provider, resp.durationMs);
      recordProviderSuccess(candidate.provider, resp.durationMs);

      await chargeBudget(call.sessionId, resp.totalTokens);
      await appendAudit(
        'llm.call',
        {
          provider: candidate.provider,
          model: resp.model,
          sessionId: call.sessionId,
          complexity: decision.complexity,
          evaluationTimeMs: decision.evaluationTimeMs,
          promptTokens: resp.promptTokens,
          completionTokens: resp.completionTokens,
          durationMs: resp.durationMs,
        },
        'llm-gateway'
      );

      return resp;
    } catch (err) {
      lastError = err;
      await recordFailure(candidate.provider);

      const { is5xx, status, reason } = is5xxOrTransientError(err);
      recordProviderFailure(candidate.provider, status, reason);

      await appendAudit(
        'llm.call_failed',
        {
          provider: candidate.provider,
          model: candidate.model,
          sessionId: call.sessionId,
          is5xx,
          error: err instanceof Error ? err.message : String(err),
        },
        'llm-gateway'
      );

      log.warn('omniroute.failover_attempt', {
        failedProvider: candidate.provider,
        failedModel: candidate.model,
        attemptIndex: i,
        hasNext: i + 1 < candidates.length,
        error: err instanceof Error ? err.message : String(err),
      });

      // If HTTP 5xx or transient failure and another candidate is available, failover dynamically
      if (i + 1 < candidates.length) {
        continue;
      }
    }
  }

  throw lastError ?? new Error(`all_providers_failed_for_model:${call.request.model}`);
}

function estimateTokens(req: ProviderRequest): number {
  // Cheap estimate: 4 chars per token. Good enough for budget pre-charge.
  const total = req.messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(total / 4) + (req.maxTokens ?? 1024);
}

export function streamLLMGateway(call: GatewayCall): ReadableStream<Uint8Array> {
  const picked = pickProvider(call.request.model, call.policy);
  const provider = picked ? picked.adapter.name : 'portkey';
  return streamPortkeyBridge(call.request, {
    provider,
    apiKey: picked?.apiKey,
  });
}

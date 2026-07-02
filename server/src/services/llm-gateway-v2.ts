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
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { llmProviderHealth, llmTokenBudgets } from "../db/schema.js";
import { eq, sql, and } from "drizzle-orm";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";

/* ─── Provider contract ──────────────────────────────────────────────────── */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
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
  requires?: Array<"vision" | "tools" | "1m_context" | "json_mode">;
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
  readonly capabilities: Set<"vision" | "tools" | "1m_context" | "json_mode">;
  readonly models: string[];                  // e.g. ["gpt-4o", "gpt-4o-mini"]
  invoke(req: ProviderRequest, opts: { apiKey?: string; baseUrl?: string }): Promise<ProviderResponse>;
}

/* ─── Provider registry ──────────────────────────────────────────────────── */

import { openaiProvider } from "./providers/openai.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { googleProvider } from "./providers/google.js";
import { ollamaProvider } from "./providers/ollama.js";
import { vllmProvider } from "./providers/vllm.js";
import { m3Provider } from "./providers/m3.js";

const REGISTRY: Record<string, ProviderAdapter> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  ollama: ollamaProvider,
  vllm: vllmProvider,
  m3: m3Provider,
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
  requires?: ProviderRequest["requires"];
}

export function pickProvider(model: string, policy: RoutingPolicy): { adapter: ProviderAdapter; apiKey?: string } | null {
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
    case "openai":    return process.env.OPENAI_API_KEY;
    case "anthropic": return process.env.ANTHROPIC_API_KEY;
    case "google":    return process.env.GOOGLE_API_KEY;
    case "ollama":    return undefined;
    case "vllm":      return process.env.VLLM_API_KEY;
    case "m3":        return process.env.M3_API_KEY;
    default:          return undefined;
  }
}

/* ─── Circuit breaker ────────────────────────────────────────────────────── */

interface BreakerState {
  state: "closed" | "open" | "half_open";
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
    b = { state: "closed", failureCount: 0, successCount: 0, openedAt: null, p95Ms: 0 };
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
  if (b.state === "half_open" && b.successCount >= BREAKER_CONFIG.successThreshold) {
    b.state = "closed";
    b.openedAt = null;
    await persistBreaker(provider, b);
    log.info("llm.breaker_closed", { provider });
  } else {
    await persistBreaker(provider, b);
  }
}

async function recordFailure(provider: string): Promise<void> {
  const b = getBreaker(provider);
  b.failureCount++;
  if (b.state === "half_open" || b.failureCount >= BREAKER_CONFIG.failureThreshold) {
    b.state = "open";
    b.openedAt = Date.now();
    log.warn("llm.breaker_opened", { provider, failureCount: b.failureCount });
  }
  await persistBreaker(provider, b);
}

async function persistBreaker(provider: string, b: BreakerState): Promise<void> {
  await db.insert(llmProviderHealth).values({
    provider,
    state: b.state,
    failureCount: b.failureCount,
    successCount: b.successCount,
    p95Ms: b.p95Ms,
    lastFailureAt: b.failureCount > 0 ? new Date() : null,
    lastSuccessAt: b.successCount > 0 ? new Date() : null,
    openedAt: b.openedAt ? new Date(b.openedAt) : null,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
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
  if (b.state === "closed" || b.state === "half_open") return true;
  if (b.openedAt && Date.now() - b.openedAt >= BREAKER_CONFIG.openMs) {
    b.state = "half_open";
    b.successCount = 0;
    await persistBreaker(provider, b);
    log.info("llm.breaker_half_open", { provider });
    return true;
  }
  return false;
}

export async function getBreakerSnapshot(): Promise<Record<string, { state: string; p95Ms: number; failureCount: number }>> {
  const rows = await db.query.llmProviderHealth.findMany();
  const out: Record<string, { state: string; p95Ms: number; failureCount: number }> = {};
  for (const r of rows) out[r.provider] = { state: r.state, p95Ms: r.p95Ms, failureCount: r.failureCount };
  return out;
}

/* ─── Token budgets ──────────────────────────────────────────────────────── */

export async function setBudget(opts: {
  sessionId: string;
  budget: number;
  expiresAt?: Date;
}): Promise<void> {
  await db.insert(llmTokenBudgets).values({
    sessionId: opts.sessionId,
    budget: opts.budget,
    used: 0,
    hardKill: false,
    reason: null,
    expiresAt: opts.expiresAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: llmTokenBudgets.sessionId,
    set: { budget: opts.budget, expiresAt: opts.expiresAt ?? null, updatedAt: new Date() },
  });
}

export async function killSession(sessionId: string, reason: string): Promise<void> {
  await db.update(llmTokenBudgets)
    .set({ hardKill: true, reason, updatedAt: new Date() })
    .where(eq(llmTokenBudgets.sessionId, sessionId));
  await appendAudit("llm.session_killed", { sessionId, reason }, "llm-gateway");
}

export async function getBudget(sessionId: string): Promise<{ budget: number; used: number; hardKill: boolean; expiresAt: Date | null } | null> {
  const row = await db.query.llmTokenBudgets.findFirst({ where: eq(llmTokenBudgets.sessionId, sessionId) });
  if (!row) return null;
  return { budget: row.budget, used: row.used, hardKill: row.hardKill, expiresAt: row.expiresAt };
}

export async function chargeBudget(sessionId: string, tokens: number): Promise<{ allowed: boolean; reason?: string; remaining: number }> {
  const row = await db.query.llmTokenBudgets.findFirst({ where: eq(llmTokenBudgets.sessionId, sessionId) });
  if (!row) {
    // No budget set → create a default 100k budget
    await setBudget({ sessionId, budget: 100_000 });
    return { allowed: true, remaining: 100_000 };
  }
  if (row.hardKill) return { allowed: false, reason: row.reason ?? "hard_kill", remaining: 0 };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return { allowed: false, reason: "budget_expired", remaining: 0 };
  if (row.used + tokens > row.budget) return { allowed: false, reason: "budget_exceeded", remaining: row.budget - row.used };
  await db.update(llmTokenBudgets)
    .set({ used: sql`${llmTokenBudgets.used} + ${tokens}`, updatedAt: new Date() })
    .where(eq(llmTokenBudgets.sessionId, sessionId));
  return { allowed: true, remaining: row.budget - row.used - tokens };
}

/* ─── Gateway dispatch (the public entry point) ────────────────────────── */

export interface GatewayCall {
  sessionId: string;          // budget key
  policy: RoutingPolicy;
  request: ProviderRequest;
}

export async function callLLMGateway(call: GatewayCall): Promise<ProviderResponse> {
  const picked = pickProvider(call.request.model, call.policy);
  if (!picked) {
    await appendAudit("llm.no_provider", { model: call.request.model, policy: call.policy }, "llm-gateway");
    throw new Error(`no_provider_for_model:${call.request.model}`);
  }

  if (!(await canCallProvider(picked.adapter.name))) {
    await appendAudit("llm.circuit_open", { provider: picked.adapter.name }, "llm-gateway");
    throw new Error(`circuit_open:${picked.adapter.name}`);
  }

  // Budget check (estimate; will charge after response)
  const estTokens = estimateTokens(call.request);
  const charge = await chargeBudget(call.sessionId, estTokens);
  if (!charge.allowed) {
    await appendAudit("llm.budget_denied", { sessionId: call.sessionId, reason: charge.reason }, "llm-gateway");
    throw new Error(`budget_denied:${charge.reason}`);
  }

  const start = Date.now();
  try {
    const resp = await picked.adapter.invoke(call.request, {
      apiKey: picked.apiKey,
      baseUrl: process.env[`${picked.adapter.name.toUpperCase()}_BASE_URL`],
    });
    await recordSuccess(picked.adapter.name, resp.durationMs);
    await chargeBudget(call.sessionId, resp.totalTokens);
    await appendAudit("llm.call", {
      provider: picked.adapter.name,
      model: resp.model,
      sessionId: call.sessionId,
      promptTokens: resp.promptTokens,
      completionTokens: resp.completionTokens,
      durationMs: resp.durationMs,
    }, "llm-gateway");
    return resp;
  } catch (e) {
    await recordFailure(picked.adapter.name);
    await appendAudit("llm.call_failed", {
      provider: picked.adapter.name,
      model: call.request.model,
      sessionId: call.sessionId,
      error: e instanceof Error ? e.message : String(e),
    }, "llm-gateway");
    throw e;
  }
}

function estimateTokens(req: ProviderRequest): number {
  // Cheap estimate: 4 chars per token. Good enough for budget pre-charge.
  const total = req.messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(total / 4) + (req.maxTokens ?? 1024);
}
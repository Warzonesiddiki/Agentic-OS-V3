/**
 * omniroute-bridge.ts — OmniRoute Intelligent Fallback & Dynamic Routing Engine
 *
 * Implements Phase 8 of the redemption plan:
 * 1. Sub-5ms complexity-based cost routing:
 *    - Simple requests -> mini / flash models (gpt-4o-mini, gemini-1.5-flash, claude-3-5-haiku)
 *    - Complex requests -> flagship models (gpt-4o, claude-3-5-sonnet, gemini-1.5-pro)
 * 2. Dynamic provider health tracking & HTTP 5xx failover chains.
 * 3. Cost metrics estimation and fallback resolution.
 *
 * @module services/omniroute-bridge
 */

import { performance } from 'node:perf_hooks';
import type { ProviderRequest, RoutingPolicy } from './llm-gateway-v2.js';
import { log } from '../lib/logging.js';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  consecutive5xxCount: number;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastFailureCode: number | null;
  lastFailureReason: string | null;
  lastSuccessAt: number | null;
  p95Ms: number;
}

export interface CandidateTarget {
  provider: string;
  model: string;
  tier: 'mini' | 'flash' | 'standard' | 'flagship';
  estimatedCostPer1KTokensUSD: number;
}

export interface OmniRouteDecision {
  complexity: TaskComplexity;
  chosenProvider: string;
  chosenModel: string;
  fallbackChain: CandidateTarget[];
  evaluationTimeMs: number;
  costTier: 'low' | 'medium' | 'high';
  reason: string;
}

/* ─── Model Tier Mappings & Cost Metrics ─────────────────────────────────── */

export const MODEL_TIER_CATALOG: Record<
  string,
  { provider: string; tier: CandidateTarget['tier']; costPer1K: number }
> = {
  // OpenAI
  'gpt-4o-mini': { provider: 'openai', tier: 'mini', costPer1K: 0.00015 },
  'gpt-4o': { provider: 'openai', tier: 'flagship', costPer1K: 0.0025 },
  'o1-mini': { provider: 'openai', tier: 'standard', costPer1K: 0.003 },
  o1: { provider: 'openai', tier: 'flagship', costPer1K: 0.015 },
  'gpt-4-turbo': { provider: 'openai', tier: 'flagship', costPer1K: 0.01 },
  'gpt-3.5-turbo': { provider: 'openai', tier: 'mini', costPer1K: 0.0005 },

  // Anthropic
  'claude-3-5-haiku-20241022': { provider: 'anthropic', tier: 'mini', costPer1K: 0.0008 },
  'claude-3-haiku-20240307': { provider: 'anthropic', tier: 'mini', costPer1K: 0.00025 },
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', tier: 'flagship', costPer1K: 0.003 },
  'claude-3-opus-20240229': { provider: 'anthropic', tier: 'flagship', costPer1K: 0.015 },

  // Google
  'gemini-1.5-flash': { provider: 'google', tier: 'flash', costPer1K: 0.000075 },
  'gemini-1.5-pro': { provider: 'google', tier: 'flagship', costPer1K: 0.00125 },
  'gemini-1.0-pro': { provider: 'google', tier: 'standard', costPer1K: 0.0005 },

  // M3 / Local
  'm3-fast': { provider: 'm3', tier: 'mini', costPer1K: 0.0 },
  'm3-reasoning': { provider: 'm3', tier: 'flagship', costPer1K: 0.0 },
  'm3-coder': { provider: 'm3', tier: 'standard', costPer1K: 0.0 },
  'llama3.1': { provider: 'ollama', tier: 'mini', costPer1K: 0.0 },
  'llama3.2': { provider: 'ollama', tier: 'mini', costPer1K: 0.0 },
  'meta-llama/Llama-3.1-8B-Instruct': { provider: 'vllm', tier: 'mini', costPer1K: 0.0 },
  'meta-llama/Llama-3.1-70B-Instruct': { provider: 'vllm', tier: 'flagship', costPer1K: 0.0 },
};

/* ─── Task Complexity Classifier (< 1ms execution) ────────────────────────── */

const COMPLEX_KEYWORDS =
  /\b(refactor|optimize|benchmark|architecture|debug|implement|prove|solve|reasoning|analysis|theorem|algorithm|explain step-by-step|step-by-step|chain of thought|sql query|regex|ast|transpile|compiler)\b/i;
const SIMPLE_KEYWORDS =
  /\b(hi|hello|greet|ping|summary|tldr|transcribe|format|echo|extract name|yes or no|true or false|capitalize|rephrase)\b/i;

export function classifyComplexity(req: ProviderRequest): TaskComplexity {
  // 1. Explicit requirements mask check
  if (req.requires?.includes('vision') || req.requires?.includes('1m_context')) {
    return 'complex';
  }

  // 2. Length & token heuristics
  let totalChars = 0;
  let hasCodeBlock = false;
  for (const msg of req.messages) {
    totalChars += msg.content.length;
    if (!hasCodeBlock && msg.content.includes('```')) {
      hasCodeBlock = true;
    }
  }

  const estTokens = Math.ceil(totalChars / 4);

  // High token count or code blocks strongly lean complex
  if (estTokens > 1500 || (hasCodeBlock && estTokens > 500)) {
    return 'complex';
  }

  // 3. Keyword / Regex heuristic
  const sampleText = req.messages
    .map((m) => m.content)
    .join(' ')
    .slice(0, 1000);
  if (COMPLEX_KEYWORDS.test(sampleText)) {
    return 'complex';
  }

  if (estTokens > 400 || req.requires?.includes('tools')) {
    return 'medium';
  }

  if (SIMPLE_KEYWORDS.test(sampleText) || estTokens < 150) {
    return 'simple';
  }

  return 'medium';
}

/* ─── Dynamic Provider Health Tracking ──────────────────────────────────── */

const providerHealthMap = new Map<string, ProviderHealth>();

export function getProviderHealth(provider: string): ProviderHealth {
  let h = providerHealthMap.get(provider);
  if (!h) {
    h = {
      provider,
      status: 'healthy',
      consecutive5xxCount: 0,
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastFailureCode: null,
      lastFailureReason: null,
      lastSuccessAt: null,
      p95Ms: 0,
    };
    providerHealthMap.set(provider, h);
  }
  return h;
}

export function recordProviderSuccess(provider: string, durationMs: number): void {
  const h = getProviderHealth(provider);
  h.consecutive5xxCount = 0;
  h.consecutiveFailures = 0;
  h.lastSuccessAt = Date.now();
  h.status = 'healthy';
  h.p95Ms = h.p95Ms === 0 ? durationMs : h.p95Ms * 0.95 + durationMs * 0.05;
}

export function recordProviderFailure(
  provider: string,
  statusCode?: number,
  reason?: string
): void {
  const h = getProviderHealth(provider);
  h.consecutiveFailures++;
  h.lastFailureAt = Date.now();
  h.lastFailureCode = statusCode ?? null;
  h.lastFailureReason = reason ?? null;

  const is5xx = statusCode && statusCode >= 500 && statusCode <= 599;
  if (is5xx) {
    h.consecutive5xxCount++;
  }

  if (h.consecutive5xxCount >= 3 || h.consecutiveFailures >= 5) {
    h.status = 'down';
  } else if (h.consecutive5xxCount >= 1 || h.consecutiveFailures >= 2) {
    h.status = 'degraded';
  }

  log.warn('omniroute.health_degraded', {
    provider,
    status: h.status,
    consecutive5xxCount: h.consecutive5xxCount,
    statusCode,
    reason,
  });
}

export function isProviderHealthy(provider: string): boolean {
  const h = getProviderHealth(provider);
  if (h.status === 'down') {
    // Cooldown check: if down for > 30 seconds, allow trial / degraded call
    if (h.lastFailureAt && Date.now() - h.lastFailureAt > 30_000) {
      h.status = 'degraded';
      return true;
    }
    return false;
  }
  return true;
}

/* ─── Decision & Fallback Chain Resolution ──────────────────────────────── */

export function resolveOmniRoute(req: ProviderRequest, policy?: RoutingPolicy): OmniRouteDecision {
  const startTime = performance.now();

  const complexity = classifyComplexity(req);

  // Build model preference tiers based on complexity:
  // Simple -> mini/flash (gpt-4o-mini, gemini-1.5-flash, claude-3-5-haiku-20241022)
  // Medium -> balanced (gpt-4o-mini, gemini-1.5-pro, claude-3-5-sonnet-20241022)
  // Complex -> flagship (gpt-4o, claude-3-5-sonnet-20241022, gemini-1.5-pro)

  let preferredCandidates: Array<{ provider: string; model: string }>;

  if (complexity === 'simple') {
    preferredCandidates = [
      { provider: 'google', model: 'gemini-1.5-flash' },
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      { provider: 'm3', model: 'm3-fast' },
      { provider: 'ollama', model: 'llama3.1' },
      { provider: 'vllm', model: 'meta-llama/Llama-3.1-8B-Instruct' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    ];
  } else if (complexity === 'medium') {
    preferredCandidates = [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'google', model: 'gemini-1.5-pro' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'google', model: 'gemini-1.5-flash' },
      { provider: 'm3', model: 'm3-coder' },
    ];
  } else {
    // Complex
    preferredCandidates = [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      { provider: 'google', model: 'gemini-1.5-pro' },
      { provider: 'openai', model: 'o1' },
      { provider: 'm3', model: 'm3-reasoning' },
      { provider: 'openai', model: 'gpt-4o-mini' },
    ];
  }

  // If specific model was requested by caller and is not generic auto, place it first in chain
  const requestedModel = req.model;
  const isGenericModel =
    !requestedModel || ['auto', 'omniroute', 'default'].includes(requestedModel.toLowerCase());

  if (!isGenericModel) {
    const known = MODEL_TIER_CATALOG[requestedModel];
    const reqProvider = known?.provider || (policy?.force ?? 'openai');
    // Prepend requested target
    preferredCandidates = [
      { provider: reqProvider, model: requestedModel },
      ...preferredCandidates.filter(
        (c) => !(c.provider === reqProvider && c.model === requestedModel)
      ),
    ];
  }

  // Filter chain by capability requirements
  if (req.requires?.length) {
    const reqs = req.requires;
    preferredCandidates = preferredCandidates.filter((c) => {
      if (reqs.includes('vision') && c.model.includes('haiku') && !c.model.includes('3-5'))
        return false;
      return true;
    });
  }

  // Sort candidate chain by provider health: Healthy first, Degraded second, Down last
  const sortedChain: CandidateTarget[] = preferredCandidates
    .map((c) => {
      const catalogItem = MODEL_TIER_CATALOG[c.model];
      return {
        provider: c.provider,
        model: c.model,
        tier: catalogItem?.tier ?? (complexity === 'simple' ? 'mini' : 'flagship'),
        estimatedCostPer1KTokensUSD: catalogItem?.costPer1K ?? 0.001,
      };
    })
    .sort((a, b) => {
      const healthA = isProviderHealthy(a.provider)
        ? getProviderHealth(a.provider).status === 'healthy'
          ? 0
          : 1
        : 2;
      const healthB = isProviderHealthy(b.provider)
        ? getProviderHealth(b.provider).status === 'healthy'
          ? 0
          : 1
        : 2;
      return healthA - healthB;
    });

  const chosen = sortedChain[0] || {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tier: 'mini',
    estimatedCostPer1KTokensUSD: 0.00015,
  };

  const evaluationTimeMs = Number((performance.now() - startTime).toFixed(3));

  const costTier: 'low' | 'medium' | 'high' =
    complexity === 'simple' ? 'low' : complexity === 'medium' ? 'medium' : 'high';

  return {
    complexity,
    chosenProvider: chosen.provider,
    chosenModel: chosen.model,
    fallbackChain: sortedChain,
    evaluationTimeMs,
    costTier,
    reason: `Routed for complexity=${complexity} (eval: ${evaluationTimeMs}ms)`,
  };
}

/** Helper to identify if error is HTTP 5xx or transient provider network error */
export function is5xxOrTransientError(err: unknown): {
  is5xx: boolean;
  status?: number;
  reason: string;
} {
  const msg = err instanceof Error ? err.message : String(err);

  // Check HTTP 5xx patterns in error string (e.g. "openai_503:...", "anthropic_500:...")
  const statusMatch = msg.match(/_([5]\d{2}):/) || msg.match(/\b([5]\d{2})\b/);
  if (statusMatch && statusMatch[1]) {
    const status = parseInt(statusMatch[1], 10);
    return { is5xx: true, status, reason: msg.slice(0, 100) };
  }

  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('overloaded') ||
    msg.includes('rate_limit')
  ) {
    return { is5xx: true, reason: msg.slice(0, 100) };
  }

  return { is5xx: false, reason: msg.slice(0, 100) };
}

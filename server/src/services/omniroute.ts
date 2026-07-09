/**
 * OmniRoute provider router (Nexus-local, provider-agnostic).
 *
 * NOTE: OmniRoute integration surface. The concrete provider adapters are wired
 * through server/src/services/omniroute-bridge.js (excluded from compilation here).
 * This module re-exports the bridge and supplies Nexus-local helpers.
 */
import { MODEL_TIER_CATALOG, getProviderHealth, isProviderHealthy } from './omniroute-bridge.js';

/** Provider id used by OmniRoute tier selection. */
export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'vllm'
  | 'm3';

export interface ModelTierDef {
  id: string;
  rank: number;
  providers: ProviderId[];
  contextWindow: number;
  costPer1k: number;
}

export interface RouteDecision {
  provider: ProviderId;
  model: string;
  tier: string;
  reason: string;
}

const DEFAULT_TIERS: ModelTierDef[] = [
  { id: 'ultra', rank: 3, providers: ['openai', 'anthropic'], contextWindow: 200_000, costPer1k: 0.06 },
  { id: 'pro', rank: 2, providers: ['openai', 'anthropic', 'google'], contextWindow: 128_000, costPer1k: 0.02 },
  { id: 'standard', rank: 1, providers: ['google', 'ollama', 'vllm', 'm3'], contextWindow: 32_000, costPer1k: 0.004 },
];

/** Resolve model tiers, preferring the bridge catalog when available. */
export function getTiers(): ModelTierDef[] {
  return MODEL_TIER_CATALOG?.length ? MODEL_TIER_CATALOG : DEFAULT_TIERS;
}

/** Select the best healthy provider for a tier. */
export function routeModel(tier: string, preferred?: ProviderId): RouteDecision {
  const tiers = getTiers();
  const tierDef = tiers.find((t) => t.id === tier) ?? tiers[0];
  const candidates = preferred ? [preferred, ...tierDef.providers] : tierDef.providers;
  for (const provider of candidates) {
    if (isProviderHealthy(provider)) {
      return { provider, model: modelFor(provider, tierDef.id), tier: tierDef.id, reason: 'provider-healthy' };
    }
  }
  return { provider: candidates[0], model: modelFor(candidates[0], tierDef.id), tier: tierDef.id, reason: 'fallback-no-health' };
}

function modelFor(provider: ProviderId, tier: string): string {
  switch (provider) {
    case 'openai':
      return tier === 'ultra' ? 'gpt-4o' : tier === 'pro' ? 'gpt-4o-mini' : 'gpt-4o-mini';
    case 'anthropic':
      return tier === 'ultra' ? 'claude-3-opus' : 'claude-3-sonnet';
    case 'google':
      return 'gemini-1.5-pro';
    case 'ollama':
      return 'llama3';
    case 'vllm':
      return 'local-vllm';
    case 'm3':
      return 'm3-large';
    default:
      return 'unknown';
  }
}

/** Snapshot provider health for dashboards. */
export function providerHealthSnapshot() {
  const tiers = getTiers();
  const providers = Array.from(new Set(tiers.flatMap((t) => t.providers)));
  return providers.map((p) => ({ provider: p, healthy: isProviderHealthy(p), health: getProviderHealth(p) }));
}

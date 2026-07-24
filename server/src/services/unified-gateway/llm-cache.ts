/**
 * llm-cache.ts - response cache for identical LLM prompts.
 *
 * Caches model responses keyed by (provider, model, messages, temperature,
 * maxTokens, topP, stop). By default it only caches deterministic requests
 * (temperature === 0) to avoid serving stale non-deterministic output, and is
 * disabled unless a positive TTL is configured (env NEXUS_LLM_CACHE_TTL_MS or
 * constructor option). Bounded by an LRU so it can never grow without limit.
 *
 * The cache is generic over the cached value so it can store a full
 * ProviderResponse without creating a type cycle with the gateway module.
 */

import { createHash } from 'node:crypto';
import { LRUCache } from '../../lib/lru-cache.js';

/** Debug-only logging (no-op unless NEXUS_DEBUG is set). */
function debugLog(_msg: string, _ctx?: Record<string, unknown>): void {
  if (process.env.NEXUS_DEBUG) {
    console.debug(`[llm-cache] ${_msg}`, _ctx ?? '');
  }
}

export interface LLMCacheRequest {
  provider: string;
  model: string;
  messages: ReadonlyArray<{ role: string; content: string }> | string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: ReadonlyArray<string>;
  [key: string]: unknown;
}

export interface LLMCacheOptions {
  /** Max entries retained. Default 2000. */
  maxEntries?: number;
  /** TTL in ms. 0 disables caching. Default reads NEXUS_LLM_CACHE_TTL_MS (0). */
  ttlMs?: number;
  /** Only cache deterministic (temperature === 0) requests. Default true. */
  onlyDeterministic?: boolean;
  /** Namespace prefix for the underlying LRU (helps multiple instances). */
  name?: string;
}

export class LLMResponseCache {
  private readonly cache: LRUCache<string, unknown>;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly ttlMs: number;
  private readonly onlyDeterministic: boolean;
  public hits = 0;
  public misses = 0;

  constructor(opts: LLMCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? Number(process.env.NEXUS_LLM_CACHE_TTL_MS ?? 0);
    this.onlyDeterministic = opts.onlyDeterministic ?? true;
    const capacity = opts.maxEntries ?? Number(process.env.NEXUS_LLM_CACHE_MAX ?? 2000);
    this.cache = new LRUCache<string, unknown>(opts.name ?? 'llm-response', capacity, this.ttlMs);
  }

  /** Whether caching is active for the given request. */
  isEnabled(req: LLMCacheRequest): boolean {
    if (this.ttlMs <= 0) return false;
    if (this.onlyDeterministic && (req.temperature ?? 0) !== 0) return false;
    return true;
  }

  /** Stable cache key derived from every input that affects the output. */
  static key(req: LLMCacheRequest): string {
    const normalized = {
      provider: req.provider,
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0,
      maxTokens: req.maxTokens ?? 0,
      topP: req.topP ?? 0,
      stop: req.stop ?? [],
    };
    const raw = JSON.stringify(normalized);
    return 'llm:' + createHash('sha256').update(raw).digest('hex');
  }

  /** Read a cached response, or compute it. Honors TTL + determinism rules. */
  async getOrCompute<T>(req: LLMCacheRequest, compute: () => Promise<T>): Promise<T> {
    if (!this.isEnabled(req)) return compute();
    const key = LLMResponseCache.key(req);
    const hit = this.cache.get(key) as T | undefined;
    if (hit !== undefined) {
      this.hits++;
      debugLog('hit', { provider: req.provider, model: req.model });
      return hit;
    }
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending !== undefined) {
      debugLog('coalesced', { provider: req.provider, model: req.model });
      return pending;
    }

    this.misses++;
    debugLog('miss', { provider: req.provider, model: req.model });
    const calculation = compute().then((entry) => {
      this.cache.set(key, entry);
      return entry;
    });
    this.inFlight.set(key, calculation as Promise<unknown>);
    try {
      return await calculation;
    } finally {
      this.inFlight.delete(key);
    }
  }

  stats() {
    return { ...this.cache.stats(), enabled: this.ttlMs > 0, ttlMs: this.ttlMs };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/** Shared singleton so all gateway traffic benefits from the same cache pool. */
export const defaultLLMCache = new LLMResponseCache();

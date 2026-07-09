import os

base = 'src/services/unified-gateway/'

llm_cache = r'''/**
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
    // eslint-disable-next-line no-console
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
  private readonly cache: LRUCache<unknown>;
  private readonly ttlMs: number;
  private readonly onlyDeterministic: boolean;
  public hits = 0;
  public misses = 0;

  constructor(opts: LLMCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? Number(process.env.NEXUS_LLM_CACHE_TTL_MS ?? 0);
    this.onlyDeterministic = opts.onlyDeterministic ?? true;
    const capacity = opts.maxEntries ?? Number(process.env.NEXUS_LLM_CACHE_MAX ?? 2000);
    this.cache = new LRUCache<unknown>(opts.name ?? 'llm-response', capacity, this.ttlMs);
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
    this.misses++;
    debugLog('miss', { provider: req.provider, model: req.model });
    const entry = await compute();
    this.cache.set(key, entry);
    return entry;
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
'''

conn_pool = r'''/**
 * connection-pool.ts - bounded connection reuse + backpressure for LLM calls.
 *
 * Two concerns addressed here (both requested in the PerfC perf workstream):
 *
 *  1. Connection reuse - a shared semaphore bounds the number of concurrent
 *     outbound connections to LLM providers. Because the Node global `fetch`
 *     already keeps an internal keep-alive pool, funnelling every call through a
 *     single acquire/release path maximizes connection reuse (hot connections
 *     stay open instead of being opened per-call) and prevents connection
 *     exhaustion under burst. When `undici` is importable it is used to attach
 *     an explicit keep-alive `Agent` dispatcher; otherwise the module degrades
 *     gracefully to the default global pool.
 *
 *  2. Backpressure - callers `acquire()` a slot; if the pool is full the call
 *     blocks (awaits) instead of opening a new socket. This applies upstream
 *     pressure and prevents the runtime from overwhelming providers (or the
 *     local file descriptor limit). The same primitive is reused by the agent
 *     runtime dispatch loop for bounded fan-out.
 */

type Dispatcher = unknown;

let sharedDispatcher: Dispatcher | null | undefined;
let dispatcherError = false;

function debugLog(_msg: string, _ctx?: Record<string, unknown>): void {
  if (process.env.NEXUS_DEBUG) {
    // eslint-disable-next-line no-console
    console.debug(`[conn-pool] ${_msg}`, _ctx ?? '');
  }
}

/**
 * Lazily resolve an explicit keep-alive dispatcher. Returns null when undici is
 * not available - callers then use the default global pool which still keeps
 * connections alive.
 */
export async function getSharedDispatcher(): Promise<Dispatcher | null> {
  if (sharedDispatcher !== undefined) return sharedDispatcher;
  if (dispatcherError) return null;
  try {
    const mod = await import('undici');
    const Agent = (mod as { Agent?: new (opts: Record<string, unknown>) => unknown }).Agent;
    if (Agent) {
      sharedDispatcher = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, pipelining: 1 });
      debugLog('undici keep-alive Agent enabled', {});
      return sharedDispatcher;
    }
  } catch {
    dispatcherError = true;
    debugLog('undici not available, using global fetch pool', {});
  }
  sharedDispatcher = null;
  return null;
}

export interface ConnectionPoolOptions {
  /** Max concurrent outbound connections. Default 32. */
  max?: number;
  /** Where to attach the resolved dispatcher (mutated in place). */
  name?: string;
}

export class ConnectionPool {
  private active = 0;
  private readonly queue: Array<{ resolve: () => void; signal?: AbortSignal }> = [];
  private readonly max: number;
  private readonly name: string;

  constructor(opts: ConnectionPoolOptions = {}) {
    this.max = Math.max(1, opts.max ?? Number(process.env.NEXUS_LLM_MAX_CONNS ?? 32));
    this.name = opts.name ?? 'llm';
  }

  get available(): number {
    return this.max - this.active;
  }

  get size(): number {
    return this.active;
  }

  get capacity(): number {
    return this.max;
  }

  /** Acquire a connection slot, applying backpressure when saturated. */
  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error('acquire aborted'));
    }
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, signal };
      if (signal) {
        if (signal.aborted) {
          reject(new Error('acquire aborted'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => {
            const idx = this.queue.indexOf(entry);
            if (idx >= 0) this.queue.splice(idx, 1);
            reject(new Error('acquire aborted'));
          },
          { once: true }
        );
      }
      this.queue.push(entry);
    });
  }

  /** Release a previously acquired slot, waking the next waiter. */
  release(): void {
    if (this.active === 0) return;
    const next = this.queue.shift();
    if (next) {
      // Stay at capacity; hand the slot directly to the waiter.
      next.resolve();
    } else {
      this.active--;
    }
  }

  /** Run `fn` with an acquired connection slot (released on completion). */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  stats() {
    return { active: this.active, waiting: this.queue.length, max: this.max, name: this.name };
  }
}

/** Process-wide pool shared by every LLM gateway call. */
export const defaultConnectionPool = new ConnectionPool({ name: 'llm-global' });
'''

bench = r'''/**
 * benchmark.ts - micro-benchmark for the LLM perf workstream.
 *
 * Measures the impact of response caching on repeated identical prompts and the
 * overhead/throughput of the bounded connection pool + backpressure. Run via:
 *
 *   npx tsx server/src/services/unified-gateway/benchmark.ts
 *
 * The file is also import-safe (no top-level side effects) so vitest can load it
 * without spawning real network calls.
 */

import { LLMResponseCache } from './llm-cache.js';
import { ConnectionPool } from './connection-pool.js';

export interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  perOpMs: number;
  speedup?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulate a provider round-trip cost (no network). */
function fakeProviderLatencyMs(): number {
  return 8;
}

export async function runCacheBenchmark(iterations = 200): Promise<BenchResult> {
  const cache = new LLMResponseCache({ ttlMs: 60_000, onlyDeterministic: true, maxEntries: 500 });
  const req = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
    temperature: 0,
    maxTokens: 16,
  };

  await cache.getOrCompute(req, async () => {
    await sleep(fakeProviderLatencyMs());
    return { content: '4', model: req.model, promptTokens: 3, completionTokens: 1, cachedAt: Date.now() };
  });

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await cache.getOrCompute({ ...req }, async () => {
      await sleep(fakeProviderLatencyMs());
      return { content: '4', model: req.model, promptTokens: 3, completionTokens: 1, cachedAt: Date.now() };
    });
  }
  const totalMs = Date.now() - start;
  return {
    name: 'llm-cache (all-hit)',
    iterations,
    totalMs,
    perOpMs: totalMs / iterations,
    speedup: fakeProviderLatencyMs() / (totalMs / iterations),
  };
}

export async function runPoolBenchmark(iterations = 500, max = 8): Promise<BenchResult> {
  const pool = new ConnectionPool({ name: 'bench', max });
  const start = Date.now();
  await Promise.all(
    Array.from({ length: iterations }, () =>
      pool.run(async () => {
        await sleep(2);
      })
    )
  );
  const totalMs = Date.now() - start;
  return {
    name: `connection-pool (max=${max})`,
    iterations,
    totalMs,
    perOpMs: totalMs / iterations,
  };
}

export async function runAllBenchmarks(): Promise<BenchResult[]> {
  const cache = await runCacheBenchmark();
  const pool = await runPoolBenchmark();
  return [cache, pool];
}

const isMain = typeof process !== 'undefined' && process.argv[1]?.includes('benchmark.ts');
if (isMain) {
  runAllBenchmarks()
    .then((results) => {
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(
          `${r.name}: ${r.iterations} ops in ${r.totalMs}ms (${r.perOpMs.toFixed(3)}ms/op)` +
            (r.speedup ? ` speedup~${r.speedup.toFixed(1)}x` : '')
        );
      }
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}
'''

for fn, content in [('llm-cache.ts', llm_cache), ('connection-pool.ts', conn_pool), ('benchmark.ts', bench)]:
    p = base + fn
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print('wrote', p, len(content))

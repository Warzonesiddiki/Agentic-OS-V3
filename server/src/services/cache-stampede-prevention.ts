/**
 * cache-stampede-prevention.ts — Prevents cache stampede (thundering herd).
 * Phase 15, Task 15.1: Cache Stampede Prevention.
 *
 * When a cached entry expires, multiple concurrent requests may all try to
 * regenerate it simultaneously — this is a "cache stampede." This module
 * implements three strategies to prevent it:
 *
 * 1. **Single-flight (coalescing)**: Only one request regenerates the value;
 *    all others wait for the result. Uses in-flight promise map.
 *
 * 2. **Stale-while-revalidate**: Serve stale data immediately while regenerating
 *    in the background. Clients get fast (slightly stale) responses.
 *
 * 3. **Probabilistic early expiration**: Before the TTL expires, randomly
 *    decide to regenerate with increasing probability as expiration approaches.
 *    Based on the "XFetch" algorithm (Google, 2023).
 *
 * @module services/cache-stampede-prevention
 */

/* ─── Single-Flight (Request Coalescing) ────────────────────────────────── */

/**
 * Ensures that only one execution of a function runs at a time for a given key.
 * All concurrent calls with the same key share the same in-flight promise.
 *
 * Usage:
 *   const result = await singleFlight('user:123', () => expensiveLookup(123));
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<unknown>>();

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Number of currently coalesced operations. */
  get pendingCount(): number {
    return this.inFlight.size;
  }

  /** Cancel all in-flight operations (for shutdown). */
  clear(): void {
    this.inFlight.clear();
  }
}

/* ─── Stale-While-Revalidate Cache ──────────────────────────────────────── */

export interface StaleCacheEntry<T> {
  value: T;
  storedAt: number;
  ttlMs: number;
  staleTtlMs: number; // How long to serve stale data
}

/**
 * A cache that serves stale data while revalidating in the background.
 *
 * Timeline:
 *   [fresh period] → [stale period] → [expired]
 *   Serve normally    Serve + regen     Block + regen
 */
export class StaleWhileRevalidateCache<T> {
  private store = new Map<string, StaleCacheEntry<T>>();
  private singleFlight = new SingleFlight();
  private revalidating = new Set<string>();

  constructor(
    private readonly ttlMs: number,
    private readonly staleTtlMs: number,
    private readonly maxEntries: number = 1000
  ) {}

  /**
   * Get a value from cache. If stale, returns immediately and revalidates in background.
   * If expired (past stale window), blocks until fresh value is computed.
   *
   * @param key - Cache key
   * @param fetcher - Function to compute the value if not cached
   * @returns The cached or fresh value
   */
  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.store.get(key);
    const now = Date.now();

    if (entry) {
      const age = now - entry.storedAt;

      if (age < entry.ttlMs) {
        // Fresh — serve directly
        return entry.value;
      }

      if (age < entry.ttlMs + entry.staleTtlMs) {
        // Stale — serve immediately, revalidate in background
        if (!this.revalidating.has(key)) {
          this.revalidating.add(key);
          this.singleFlight.execute(`revalidate:${key}`, async () => {
            try {
              const fresh = await fetcher();
              this.set(key, fresh);
            } finally {
              this.revalidating.delete(key);
            }
          }).catch(() => { /* swallow background errors */ });
        }
        return entry.value; // Return stale
      }

      // Expired — fall through to blocking fetch
    }

    // Blocking fetch with single-flight coalescing
    return this.singleFlight.execute(`fetch:${key}`, async () => {
      const value = await fetcher();
      this.set(key, value);
      return value;
    });
  }

  /** Set a value in the cache. */
  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      storedAt: Date.now(),
      ttlMs: this.ttlMs,
      staleTtlMs: this.staleTtlMs,
    });
  }

  /** Invalidate a specific key. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Clear all entries. */
  clear(): void {
    this.store.clear();
    this.singleFlight.clear();
  }

  /** Get cache statistics. */
  get stats(): { size: number; revalidating: number } {
    return {
      size: this.store.size,
      revalidating: this.revalidating.size,
    };
  }
}

/* ─── Probabilistic Early Expiration (XFetch) ────────────────────────────── */

/**
 * Compute whether a cache entry should be revalidated early using
 * probabilistic early expiration (XFetch algorithm).
 *
 * The probability of early revalidation increases as the entry approaches
 * its TTL, preventing a thundering herd at exact expiration time.
 *
 * P(revalidate) = 2^((age - ttl) / beta)
 * where beta is a configurable extension factor.
 *
 * @param storedAt - When the entry was stored (ms epoch)
 * @param ttlMs - Time-to-live in milliseconds
 * @param beta - Extension factor (default: ttl * 0.15, from XFetch paper)
 * @returns true if the entry should be revalidated now
 */
export function shouldRevalidateEarly(
  storedAt: number,
  ttlMs: number,
  beta?: number
): boolean {
  const age = Date.now() - storedAt;
  const effectiveBeta = beta ?? ttlMs * 0.15;

  if (effectiveBeta <= 0) return age >= ttlMs;

  // XFetch formula: P = 2^((age - ttl) / beta)
  const exponent = (age - ttlMs) / effectiveBeta;
  const probability = Math.pow(2, exponent);

  // Clamp to [0, 1]
  const clampedProb = Math.min(1, Math.max(0, probability));

  return Math.random() < clampedProb;
}

/* ─── Cache Stampede Monitor ────────────────────────────────────────────── */

export interface StampedeMetrics {
  totalRequests: number;
  coalescedRequests: number;
  stampedePrevented: number;
  staleHits: number;
  freshHits: number;
  misses: number;
  avgCoalesceWaitMs: number;
}

/**
 * Monitor that tracks cache stampede prevention metrics.
 */
export class StampedeMonitor {
  private metrics: StampedeMetrics = {
    totalRequests: 0,
    coalescedRequests: 0,
    stampedePrevented: 0,
    staleHits: 0,
    freshHits: 0,
    misses: 0,
    avgCoalesceWaitMs: 0,
  };
  private waitTimes: number[] = [];

  recordFresh(): void {
    this.metrics.totalRequests++;
    this.metrics.freshHits++;
  }

  recordStale(): void {
    this.metrics.totalRequests++;
    this.metrics.staleHits++;
  }

  recordMiss(): void {
    this.metrics.totalRequests++;
    this.metrics.misses++;
  }

  recordCoalesced(waitMs: number): void {
    this.metrics.coalescedRequests++;
    this.metrics.stampedePrevented++;
    this.waitTimes.push(waitMs);
    if (this.waitTimes.length > 100) this.waitTimes.shift();
    this.metrics.avgCoalesceWaitMs =
      this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;
  }

  getMetrics(): Readonly<StampedeMetrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalRequests: 0,
      coalescedRequests: 0,
      stampedePrevented: 0,
      staleHits: 0,
      freshHits: 0,
      misses: 0,
      avgCoalesceWaitMs: 0,
    };
    this.waitTimes = [];
  }
}

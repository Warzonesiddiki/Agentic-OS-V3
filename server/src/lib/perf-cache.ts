/**
 * perf-cache.ts — TTL cache with bounded size and zero-leak guarantees.
 *
 * The cache is bounded by `maxEntries`; when full, inserting a new (absent) key
 * evicts the oldest entry, so memory cannot grow without bound. Expired entries
 * are removed lazily on access and can be swept eagerly via `prune()`. `stats()`
 * exposes hit/miss counters for observability.
 */
interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private _hits = 0;
  private _misses = 0;

  constructor(
    private readonly name: string,
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) {
      this._misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this._misses++;
      return undefined;
    }
    this._hits++;
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    const expiresAt = Date.now() + ttlMs;
    if (this.map.has(key)) {
      this.map.set(key, { value, expiresAt });
      return;
    }
    if (this.map.size >= this.maxEntries) {
      // Evict oldest inserted (first key in insertion order) — bounds memory.
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /** Remove all expired entries; returns count removed. */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [k, v] of this.map) {
      if (now > v.expiresAt) {
        this.map.delete(k);
        removed++;
      }
    }
    return removed;
  }

  stats(): { size: number; maxEntries: number; hits: number; misses: number } {
    return {
      size: this.map.size,
      maxEntries: this.maxEntries,
      hits: this._hits,
      misses: this._misses,
    };
  }

  get size(): number {
    return this.map.size;
  }
}

export const healthStatusCache = new TTLCache<string, unknown>('health_status', 4, 2_000);
export const systemSummaryCache = new TTLCache<string, unknown>('system_summary', 4, 5_000);

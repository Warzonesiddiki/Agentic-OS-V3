/**
 * lru-cache.ts — zero-leak Least-Recently-Used cache.
 *
 * Bounded strictly by `capacity`. On `set`, when at capacity and the key is new,
 * the least-recently-used entry is evicted. Reads promote an entry to most-recent.
 * There is no unbounded growth path: Map insertion order drives eviction and
 * `capacity` is enforced on every write. `stats()` exposes hits/misses/evictions
 * for observability, and `prune()` drops expired entries (TTL) deterministically.
 */

export interface LRUStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
}

export class LRUCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number }>();
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _expired = 0;

  constructor(
    private readonly name: string,
    private readonly capacity: number,
    private readonly defaultTtlMs = 0 // 0 = no expiry
  ) {
    if (capacity < 1) throw new Error(`LRUCache(${name}) capacity must be >= 1`);
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) {
      this._misses++;
      return undefined;
    }
    if (this.defaultTtlMs > 0 && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this._expired++;
      this._misses++;
      return undefined;
    }
    // Promote to most-recent by re-inserting at the end.
    this.map.delete(key);
    this.map.set(key, entry);
    this._hits++;
    return entry.value;
  }

  /** Read without promoting and without touching hit/miss counters (peek). */
  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (this.defaultTtlMs > 0 && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this._expired++;
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : Number.MAX_SAFE_INTEGER;
    if (this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, { value, expiresAt });
      return;
    }
    if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) {
        this.map.delete(oldest);
        this._evictions++;
      }
    }
    this.map.set(key, { value, expiresAt });
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this._hits = this._misses = this._evictions = this._expired = 0;
  }

  /** Drop all expired entries; returns number removed. O(n). */
  prune(): number {
    if (this.defaultTtlMs <= 0) return 0;
    const now = Date.now();
    let removed = 0;
    for (const [k, v] of this.map) {
      if (now > v.expiresAt) {
        this.map.delete(k);
        this._expired++;
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.map.size;
  }

  stats(): LRUStats {
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      expired: this._expired,
    };
  }

  getName(): string {
    return this.name;
  }
}

/**
 * statsCache — a shared, bounded LRU used by mcp.ts (and other callers) to cache
 * expensive stats/aggregations without leaking memory. Exposed as a stable export
 * so consumers don't need to instantiate their own cache.
 */
export const statsCache = new LRUCache<string, unknown>('stats', 512);

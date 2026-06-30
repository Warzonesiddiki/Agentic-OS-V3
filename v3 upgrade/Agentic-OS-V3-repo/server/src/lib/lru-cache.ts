/**
 * lib/lru-cache.ts — Least Recently Used cache for non-mutating MCP/REST queries.
 *
 * Bypasses the database for high-frequency reads (nexus_stats, ambient context,
 * static architectural memories). TTL-based expiry + capacity-based eviction.
 *
 * Thread-safe for Node.js single-threaded event loop (no locks needed).
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private readonly capacity: number;
  private readonly ttlMs: number;
  hits = 0;
  misses = 0;

  constructor(capacity: number = 256, ttlMs: number = 30_000) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  /** Get a value by key. Returns undefined if not found or expired. */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // Move to end (most recently used) by re-inserting.
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  /** Set a value with TTL. Evicts the oldest entry if at capacity. */
  set(key: K, value: V, customTtlMs?: number): void {
    // Evict oldest if at capacity.
    if (this.map.size >= this.capacity && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs ?? this.ttlMs),
    });
  }

  /** Invalidate a specific key. */
  delete(key: K): void {
    this.map.delete(key);
  }

  /** Clear all entries. */
  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Get cache hit rate (0..1). */
  get hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  /** Get current size. */
  get size(): number {
    return this.map.size;
  }
}

/** Global cache instances for common query patterns. */
export const statsCache = new LRUCache<string, unknown>(4, 15_000);      // nexus_stats: 15s TTL
export const ambientCache = new LRUCache<string, string>(1, 60_000);     // ambient context: 60s TTL
export const healthCache = new LRUCache<string, unknown>(1, 5_000);      // health check: 5s TTL

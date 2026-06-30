/**
 * perf-cache.ts — tiny typed TTL cache helpers for hot read paths.
 *
 * This cache is intentionally process-local. It is for cheap short-lived caching
 * of health/system/status style reads, not authoritative business data.
 */
import { cacheHitsTotal, cacheMissesTotal } from "../services/metrics.js";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly name: string,
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      cacheMissesTotal.inc({ cache: this.name });
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      cacheMissesTotal.inc({ cache: this.name });
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    cacheHitsTotal.inc({ cache: this.name });
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const healthStatusCache = new TTLCache<string, unknown>("health_status", 4, 2_000);
export const systemSummaryCache = new TTLCache<string, unknown>("system_summary", 4, 5_000);

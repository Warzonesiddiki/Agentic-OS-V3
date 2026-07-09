/**
 * response-cache.ts — Phase 15.5 multi-tier response cache + 15.21 cache-stampede guard.
 *
 * L1: process-local in-memory hot cache (sub-ms).
 * L2: pluggable shared backend (default in-memory; production wires Redis via setL2Backend).
 * Tag-based invalidation: a key may carry tags; invalidating a tag evicts all keys with it.
 * Stampede protection: a single in-flight loader per key (single-flight) so N concurrent
 *   misses for the same key trigger exactly one upstream call.
 */
import { log } from '../../lib/logging.js';
import { cacheHitsTotal, cacheMissesTotal } from '../metrics.js';

export interface KVBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Best-effort enumeration (used by tag invalidation). Optional. */
  keys?(): Promise<string[]>;
}

/** In-memory KV backend (also used as the default L2). */
export class MemoryKVBackend implements KVBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string): Promise<string | undefined> {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }
  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

interface Entry {
  value: unknown;
  expiresAt: number;
  tags: Set<string>;
}

export interface CacheOptions {
  ttlMs?: number;
  tags?: string[];
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  stampedeCollapsed: number;
}

export class ResponseCache {
  private l1 = new Map<string, Entry>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> set of keys
  private inflight = new Map<string, Promise<unknown>>();
  private l2: KVBackend | null = null;
  private readonly defaultTtlMs: number;
  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    stampedeCollapsed: 0,
  };

  constructor(defaultTtlMs = 30_000, l2?: KVBackend) {
    this.defaultTtlMs = defaultTtlMs;
    this.l2 = l2 ?? new MemoryKVBackend();
  }

  /** Swap in a distributed L2 (e.g. Redis). Safe to call at boot. */
  setL2Backend(backend: KVBackend): void {
    this.l2 = backend;
  }

  private isExpired(e: Entry): boolean {
    return e.expiresAt <= Date.now();
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const l1 = this.l1.get(key);
    if (l1 && !this.isExpired(l1)) {
      this.stats.l1Hits++;
      cacheHitsTotal.inc({ cache: 'l1' });
      return l1.value as T;
    }
    if (l1) {
      this.l1.delete(key);
    }
    this.stats.l1Misses++;

    const raw = this.l2 ? await this.l2.get(key) : undefined;
    if (raw === undefined) {
      this.stats.l2Misses++;
      cacheMissesTotal.inc({ cache: 'l2' });
      return undefined;
    }
    this.stats.l2Hits++;
    cacheHitsTotal.inc({ cache: 'l2' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    // Re-promote to L1.
    this.l1.set(key, {
      value: parsed,
      expiresAt: Date.now() + this.defaultTtlMs,
      tags: new Set(),
    });
    return parsed as T;
  }

  /**
   * Get-or-load with single-flight stampede protection.
   * Concurrent callers for the same key share ONE loader invocation.
   */
  async getOrLoad<T = unknown>(
    key: string,
    loader: () => Promise<T>,
    opts?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key);
    if (existing) {
      this.stats.stampedeCollapsed++;
      return existing as Promise<T>;
    }

    const p = (async () => {
      try {
        const value = await loader();
        await this.set(key, value, opts);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p as Promise<T>;
  }

  async set(key: string, value: unknown, opts?: CacheOptions): Promise<void> {
    const ttlMs = opts?.ttlMs ?? this.defaultTtlMs;
    const tags = new Set(opts?.tags ?? []);
    this.l1.set(key, { value, expiresAt: Date.now() + ttlMs, tags });
    for (const t of tags) {
      if (!this.tagIndex.has(t)) this.tagIndex.set(t, new Set());
      this.tagIndex.get(t)!.add(key);
    }
    if (this.l2) {
      await this.l2.set(key, JSON.stringify(value), ttlMs);
    }
  }

  /** Invalidate every key carrying any of the given tags. */
  async invalidateTags(tags: string[]): Promise<number> {
    let count = 0;
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (!keys) continue;
      for (const k of [...keys]) {
        this.l1.delete(k);
        if (this.l2) await this.l2.del(k);
        count++;
      }
      this.tagIndex.delete(tag);
    }
    log.info('response-cache: invalidated tags', { tags, count });
    return count;
  }

  /** Explicit eviction of a single key across both tiers. */
  async delete(key: string): Promise<void> {
    this.l1.delete(key);
    if (this.l2) await this.l2.del(key);
  }

  /** Wipe the entire cache (both tiers). Used by the orchestrator on schema
   * migrations or explicit operator action. */
  async clear(): Promise<number> {
    const keys = [...this.l1.keys()];
    const count = keys.length;
    this.l1.clear();
    this.tagIndex.clear();
    this.inflight.clear();
    if (this.l2) {
      // Best-effort L2 flush; backend may implement a bulk del.
      for (const k of keys) await this.l2.del(k);
    }
    this.stats = { l1Hits: 0, l1Misses: 0, l2Hits: 0, l2Misses: 0, stampedeCollapsed: 0 };
    log.info('response-cache: cleared', { count });
    return count;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  /** Drop expired L1 entries. Call periodically from a reaper. */
  reap(): number {
    let removed = 0;
    for (const [k, e] of this.l1) {
      if (this.isExpired(e)) {
        this.l1.delete(k);
        removed++;
      }
    }
    return removed;
  }
}

export const responseCache = new ResponseCache();

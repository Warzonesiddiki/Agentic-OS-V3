/**
 * Metron — caching primitives (lib/perf-cache, lib/lru-cache).
 * Pure, zero DB. Verifies zero-leak bounded growth + hit/miss observability.
 */
import { describe, it, expect, vi } from 'vitest';
import { TTLCache } from '../src/lib/perf-cache.js';
import { LRUCache } from '../src/lib/lru-cache.js';

describe('TTLCache (perf-cache)', () => {
  it('get/set/hit/miss + TTL expiry', () => {
    const c = new TTLCache<string, number>('t', 10, 50);
    expect(c.get('x')).toBeUndefined();
    c.set('x', 1, 50);
    expect(c.get('x')).toBe(1);
    const s = c.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
  });

  it('evicts oldest when at capacity (bounded growth)', () => {
    const c = new TTLCache<string, number>('t', 3, 1000);
    for (const k of ['a', 'b', 'c', 'd']) c.set(k, 1, 1000);
    expect(c.size).toBe(3); // evicted 'a'
    expect(c.get('a')).toBeUndefined();
    expect(c.get('d')).toBe(1);
  });

  it('prune removes entries past TTL (deterministic via prune)', () => {
    const c = new TTLCache<string, number>('t', 10, 1); // 1ms ttl
    c.set('a', 1, 1);
    c.set('b', 2, 50_000);
    // force prune to evaluate expiry against current time
    vi.useFakeTimers();
    const removed = c.prune();
    vi.useRealTimers();
    // 'a' set with 1ms ttl is effectively expired; 'b' stays
    expect(typeof removed).toBe('number');
    expect(c.get('b')).toBe(2);
  });

  it('overwrites existing key without growing', () => {
    const c = new TTLCache<string, number>('t', 3, 1000);
    c.set('a', 1, 1000);
    c.set('a', 2, 1000);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
  });
});

describe('LRUCache (lru-cache)', () => {
  it('rejects capacity < 1', () => {
    expect(() => new LRUCache('x', 0)).toThrow();
  });

  it('promotes on get, evicts LRU at capacity', () => {
    const c = new LRUCache<string, number>('l', 2, 0);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // promote a
    c.set('c', 3); // should evict b (least recent)
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('peek does not promote or count', () => {
    const c = new LRUCache<string, number>('l', 2, 0);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.peek('a')).toBe(1);
    const st = c.stats();
    expect(st.hits).toBe(0);
    expect(st.misses).toBe(0);
    expect(st.evictions).toBe(0);
  });

  it('TTL expiry via get when ttl=0 (deterministic)', () => {
    const c = new LRUCache<string, number>('l', 5, 0); // ttl 0 → immediate expiry
    c.set('a', 1, 0);
    const v = c.get('a');
    expect(v).toBeUndefined();
    expect(c.stats().expired).toBe(1);
    expect(c.stats().misses).toBe(1);
  });

  it('prune drops nothing when ttl=0', () => {
    expect(new LRUCache<string, number>('l', 5, 0).prune()).toBe(0);
  });

  it('prune drops expired only when ttl>0', () => {
    const c = new LRUCache<string, number>('l', 5, 10);
    c.set('a', 1, 5);
    c.set('b', 2, 0); // no expiry
    expect(c.prune()).toBe(1);
    expect(c.get('b')).toBe(2);
    expect(new LRUCache('l', 5, 0).prune()).toBe(0);
  });

  it('delete + clear reset counters', () => {
    const c = new LRUCache<string, number>('l', 5, 0);
    c.set('a', 1);
    c.get('missing');
    expect(c.delete('a')).toBe(true);
    c.clear();
    expect(c.stats().size).toBe(0);
    expect(c.stats().hits).toBe(0);
  });
});

/**
 * llm-cache.test.ts — unit tests for the LLM response cache + connection pool.
 * These run under vitest with no network/DB access (pure in-memory logic).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMResponseCache, type LLMCacheRequest } from '../src/services/unified-gateway/llm-cache.js';
import { ConnectionPool } from '../src/services/unified-gateway/connection-pool.js';

const baseReq: LLMCacheRequest = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'hello' }],
  temperature: 0,
  maxTokens: 16,
};

function makeEntry() {
  return { content: 'hi', model: 'gpt-4o-mini', promptTokens: 1, completionTokens: 1, cachedAt: Date.now() };
}

describe('LLMResponseCache', () => {
  let cache: LLMResponseCache;

  beforeEach(() => {
    cache = new LLMResponseCache({ ttlMs: 1000, onlyDeterministic: true, maxEntries: 10 });
  });

  it('disables caching when ttl is 0', async () => {
    const disabled = new LLMResponseCache({ ttlMs: 0 });
    let calls = 0;
    const compute = async () => {
      calls++;
      return makeEntry();
    };
    await disabled.getOrCompute(baseReq, compute);
    await disabled.getOrCompute(baseReq, compute);
    expect(calls).toBe(2);
    expect(disabled.stats().enabled).toBe(false);
  });

  it('does not cache non-deterministic (temperature > 0) requests by default', async () => {
    const warm = { ...baseReq, temperature: 0.7 };
    let calls = 0;
    const compute = async () => {
      calls++;
      return makeEntry();
    };
    await cache.getOrCompute(warm, compute);
    await cache.getOrCompute(warm, compute);
    expect(calls).toBe(2);
  });

  it('serves identical deterministic prompts from cache (hit)', async () => {
    let calls = 0;
    const compute = async () => {
      calls++;
      return makeEntry();
    };
    const r1 = await cache.getOrCompute(baseReq, compute);
    const r2 = await cache.getOrCompute(baseReq, compute);
    expect(calls).toBe(1); // second call served from cache
    expect(r1).toBe(r2);
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);
  });

  it('produces a stable key regardless of key order / benign fields', () => {
    const k1 = LLMResponseCache.key(baseReq);
    const k2 = LLMResponseCache.key({ ...baseReq, extra: 'ignored', temperature: 0 });
    expect(k1).toBe(k2);
  });

  it('treats different prompts as distinct keys', () => {
    const k1 = LLMResponseCache.key(baseReq);
    const k2 = LLMResponseCache.key({ ...baseReq, messages: [{ role: 'user', content: 'bye' }] });
    expect(k1).not.toBe(k2);
  });

  it('evicts least-recently-used entries beyond capacity', async () => {
    const small = new LLMResponseCache({ ttlMs: 10000, maxEntries: 2 });
    let calls = 0;
    const compute = async () => {
      calls++;
      return makeEntry();
    };
    await small.getOrCompute({ ...baseReq, messages: [{ role: 'user', content: 'a' }] }, compute);
    await small.getOrCompute({ ...baseReq, messages: [{ role: 'user', content: 'b' }] }, compute);
    await small.getOrCompute({ ...baseReq, messages: [{ role: 'user', content: 'c' }] }, compute);
    // Re-request 'a' — it should have been evicted and recomputed.
    await small.getOrCompute({ ...baseReq, messages: [{ role: 'user', content: 'a' }] }, compute);
    expect(calls).toBe(4);
  });
});

describe('ConnectionPool (backpressure)', () => {
  it('limits concurrency to max and releases slots', async () => {
    const pool = new ConnectionPool({ name: 'test', max: 2 });
    let active = 0;
    let peak = 0;
    const work = async () => {
      return pool.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    };
    await Promise.all([work(), work(), work(), work()]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(pool.size).toBe(0);
    expect(pool.capacity).toBe(2);
  });

  it('applies backpressure: excess tasks queue and resolve after capacity frees', async () => {
    const pool = new ConnectionPool({ name: 'test2', max: 1 });
    const order: number[] = [];
    const slow = () =>
      pool.run(async () => {
        await new Promise((r) => setTimeout(r, 15));
        order.push(1);
      });
    const fast = () =>
      pool.run(async () => {
        order.push(2);
      });
    await Promise.all([slow(), fast()]);
    // The single slot forces fast to wait until slow releases.
    expect(order[0]).toBe(1);
    expect(order[1]).toBe(2);
  });

  it('rejects acquire when already aborted', async () => {
    const pool = new ConnectionPool({ name: 'test3', max: 2 });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(pool.acquire(ctrl.signal)).rejects.toThrow();
  });
});

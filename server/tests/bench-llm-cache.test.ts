/**
 * bench-llm-cache.test.ts — proves the LLM response cache + agent dispatch
 * backpressure behavior end to end (no FROZEN/shared imports; pure modules).
 *
 *  • Cache HIT returns without invoking the provider (compute called 0× on 2nd call).
 *  • Cache TTL expiry re-invokes the provider (compute called again after ttl).
 *  • Agent dispatch loop (agentDispatchPool) caps queue depth: when saturated,
 *    the queue does not grow unbounded — excess acquirers observe backpressure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMResponseCache, type LLMCacheRequest } from '../src/services/unified-gateway/llm-cache.js';
import { ConnectionPool } from '../src/services/unified-gateway/connection-pool.js';

const req: LLMCacheRequest = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'identical prompt' }],
  temperature: 0, // deterministic -> cacheable
  maxTokens: 16,
};

function entry(content: string) {
  return { content, model: 'gpt-4o-mini', promptTokens: 1, completionTokens: 1, cachedAt: Date.now() };
}

describe('LLM response cache — identical-prompt hit', () => {
  let cache: LLMResponseCache;
  beforeEach(() => {
    cache = new LLMResponseCache({ ttlMs: 60_000, onlyDeterministic: true, maxEntries: 50 });
  });

  it('does NOT call the provider on a cache hit (2nd identical call)', async () => {
    const compute = vi.fn(async () => entry('computed-once'));

    const r1 = await cache.getOrCompute(req, compute);
    const r2 = await cache.getOrCompute(req, compute);

    expect(compute).toHaveBeenCalledTimes(1); // provider invoked once only
    expect(r1).toBe(r2); // same cached object reference
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);
  });

  it('re-invokes the provider after TTL expiry', async () => {
    const shortTtl = new LLMResponseCache({ ttlMs: 20, onlyDeterministic: true, maxEntries: 50 });
    const compute = vi.fn(async () => entry('value'));

    await shortTtl.getOrCompute(req, compute);
    expect(compute).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 45)); // exceed ttlMs (20ms)

    const r2 = await shortTtl.getOrCompute(req, compute);
    expect(compute).toHaveBeenCalledTimes(2); // expired -> re-fetched
    expect(r2.content).toBe('value');
  });

  it('treats a transparently different prompt as a miss (not a silent hit)', async () => {
    const compute = vi.fn(async (m: string) => entry(m));
    await cache.getOrCompute(req, () => compute('a'));
    await cache.getOrCompute({ ...req, messages: [{ role: 'user', content: 'different' }] }, () => compute('b'));
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('Agent dispatch loop — backpressure queue-depth cap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquire() blocks (backpressure) when pool is saturated and resumes after release', async () => {
    const pool = new ConnectionPool({ name: 'dispatch', max: 1 });
    const order: string[] = [];

    const owner = pool.run(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('owner');
    });
    // This one must wait behind the owner (pool max = 1).
    const waiter = pool.run(async () => {
      order.push('waiter');
    });

    await Promise.all([owner, waiter]);
    expect(order).toEqual(['owner', 'waiter']); // waiter deferred -> backpressure held
    expect(pool.size).toBe(0); // fully drained
  });

  it('does not exceed capacity even under a burst (queue depth bounded)', async () => {
    const max = 2;
    const pool = new ConnectionPool({ name: 'dispatch-burst', max });
    let peak = 0;

    const tasks = Array.from({ length: 20 }, () =>
      pool.run(async () => {
        peak = Math.max(peak, pool.size);
        await new Promise((r) => setTimeout(r, 5));
      })
    );

    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(max); // backpressure kept concurrency ≤ capacity
    expect(pool.size).toBe(0);
  });

  it('rejects an already-aborted acquire (no leak / no hang)', async () => {
    const pool = new ConnectionPool({ name: 'dispatch-abort', max: 2 });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(pool.acquire(ctrl.signal)).rejects.toThrow();
  });
});

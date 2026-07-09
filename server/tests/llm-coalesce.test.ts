/**
 * llm-coalesce.test.ts — proves in-flight request coalescing: N concurrent
 * identical prompts trigger the provider EXACTLY ONCE (the others join the
 * in-flight promise instead of opening extra provider calls).
 */

import { describe, it, expect, vi } from 'vitest';
import { LLMResponseCache, type LLMCacheRequest } from '../src/services/unified-gateway/llm-cache.js';

const req: LLMCacheRequest = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'coalesce me' }],
  temperature: 0,
  maxTokens: 16,
};

function entry() {
  return { content: 'ok', model: 'gpt-4o-mini', promptTokens: 1, completionTokens: 1, cachedAt: Date.now() };
}

describe('LLM response cache — in-flight coalescing', () => {
  it('collapses 50 concurrent identical prompts into a single provider call', async () => {
    const cache = new LLMResponseCache({ ttlMs: 60_000, onlyDeterministic: true, maxEntries: 50 });
    const compute = vi.fn(async () => {
      // Simulate latency so all 50 requests overlap in-flight.
      await new Promise((r) => setTimeout(r, 15));
      return entry();
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () => cache.getOrCompute(req, compute))
    );

    expect(compute).toHaveBeenCalledTimes(1); // one real provider call
    expect(results).toHaveLength(50);
    expect(results.every((r) => r.content === 'ok')).toBe(true);
    expect(cache.hits).toBe(0); // served via coalesce, not cache (TTL not yet set until settle)
  });

  it('subsequent calls after settle hit the cache (0 extra provider calls)', async () => {
    const cache = new LLMResponseCache({ ttlMs: 60_000, onlyDeterministic: true, maxEntries: 50 });
    const compute = vi.fn(async () => entry());

    await cache.getOrCompute(req, compute); // miss -> compute
    const r = await cache.getOrCompute(req, compute); // hit -> cache
    expect(compute).toHaveBeenCalledTimes(1);
    expect(r.content).toBe('ok');
  });
});

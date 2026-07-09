/**
 * benchmark.ts - micro-benchmark for the LLM perf workstream.
 *
 * Measures the impact of response caching on repeated identical prompts and the
 * overhead/throughput of the bounded connection pool + backpressure. Run via:
 *
 *   npx tsx server/src/services/unified-gateway/benchmark.ts
 *
 * The file is also import-safe (no top-level side effects) so vitest can load it
 * without spawning real network calls.
 */

import { LLMResponseCache } from './llm-cache.js';
import { ConnectionPool } from './connection-pool.js';
import { tallyConsensus, tallyBFT, type Vote } from '../consensus.js';

export interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  perOpMs: number;
  speedup?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulate a provider round-trip cost (no network). */
function fakeProviderLatencyMs(): number {
  return 8;
}

export async function runCacheBenchmark(iterations = 200): Promise<BenchResult> {
  const cache = new LLMResponseCache({ ttlMs: 60_000, onlyDeterministic: true, maxEntries: 500 });
  const req = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
    temperature: 0,
    maxTokens: 16,
  };

  await cache.getOrCompute(req, async () => {
    await sleep(fakeProviderLatencyMs());
    return { content: '4', model: req.model, promptTokens: 3, completionTokens: 1, cachedAt: Date.now() };
  });

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await cache.getOrCompute({ ...req }, async () => {
      await sleep(fakeProviderLatencyMs());
      return { content: '4', model: req.model, promptTokens: 3, completionTokens: 1, cachedAt: Date.now() };
    });
  }
  const totalMs = Date.now() - start;
  return {
    name: 'llm-cache (all-hit)',
    iterations,
    totalMs,
    perOpMs: totalMs / iterations,
    speedup: fakeProviderLatencyMs() / (totalMs / iterations),
  };
}

export async function runPoolBenchmark(iterations = 500, max = 8): Promise<BenchResult> {
  const pool = new ConnectionPool({ name: 'bench', max });
  const start = Date.now();
  await Promise.all(
    Array.from({ length: iterations }, () =>
      pool.run(async () => {
        await sleep(2);
      })
    )
  );
  const totalMs = Date.now() - start;
  return {
    name: `connection-pool (max=${max})`,
    iterations,
    totalMs,
    perOpMs: totalMs / iterations,
  };
}

export async function runConsensusBenchmark(n = 5000): Promise<BenchResult> {
  const votes: Vote[] = Array.from({ length: n }, (_, i) => ({
    agentId: `agent-${i}`,
    value: i < n * 0.95 ? { decision: 'A' } : { decision: 'B' },
    weight: 1,
  }));
  const start = Date.now();
  const r1 = tallyConsensus('weighted', votes);
  const r2 = tallyBFT(votes, { threshold: 2 / 3 });
  const totalMs = Date.now() - start;
  return {
    name: `consensus (n=${n})`,
    iterations: 2,
    totalMs,
    perOpMs: totalMs / 2,
  };
}

export async function runAllBenchmarks(): Promise<BenchResult[]> {
  const cache = await runCacheBenchmark();
  const pool = await runPoolBenchmark();
  const cons = await runConsensusBenchmark();
  return [cache, pool, cons];
}

const isMain = typeof process !== 'undefined' && process.argv[1]?.includes('benchmark.ts');
if (isMain) {
  runAllBenchmarks()
    .then((results) => {
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(
          `${r.name}: ${r.iterations} ops in ${r.totalMs}ms (${r.perOpMs.toFixed(3)}ms/op)` +
            (r.speedup ? ` speedup~${r.speedup.toFixed(1)}x` : '')
        );
      }
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
}

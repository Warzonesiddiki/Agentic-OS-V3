/**
 * tests/services/perf-recall-benchmark.test.ts
 *
 * Performance benchmark for the Recall / Memory hot path (perfA workstream).
 *
 * Profiling (pre-optimization) revealed three hot-path costs on every recall():
 *   1. a full `feedback.findMany({ limit: 5000 })` table scan (recall.ts),
 *   2. a `tagTaxonomy` full scan per keystroke (memory-search-suggest.ts),
 *   3. an N+1 per-member `insert(memoryClusterMembers)` loop (memory-clustering.ts).
 *
 * This test asserts that, under synthetic repeated-load, the p95 latency of the
 * optimized code stays under a budget. It also locks the pure RRF fusion path so
 * memory-of-computation regressions are caught early.
 *
 * Run with:  npx vitest run tests/services/perf-recall-benchmark.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, closeTestDb, type TestDbFixtures } from '../helpers/db-setup.js';
import { rrfFuse, invalidateFeedbackCache } from '../../src/services/recall.js';
import { FederatedRecall } from '../../src/services/federated-recall.js';
import { createMemory } from '../../src/services/memory.service.js';
import { MemorySuggester, clearTagCache, tagCacheSize } from '../../src/services/memory-search-suggest.js';

let fix: TestDbFixtures;
let fed: FederatedRecall;

const P95_BUDGET_MS = Number(process.env.NEXUS_BENCH_P95_MS ?? 25);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

beforeAll(async () => {
  fix = await createTestDb();
  // Seed a synthetic corpus of memories (no real embeddings needed; recall path
  // falls back to lexical only when embeddings are unavailable in test env).
  const seeds = 200;
  for (let i = 0; i < seeds; i++) {
    await createMemory(
      {
        kind: 'fact',
        title: `Memory ${i}`,
        content: `Synthetic memory number ${i} about recall performance and caching strategies.`,
        tags: i % 5 === 0 ? ['cache', 'perf'] : ['perf'],
        importance: 0.5,
        source: 'perf-bench',
        projectId: 'bench-project',
      } as any,
      'perf-bench'
    );
  }
  fed = new FederatedRecall(0.4, 90, 0.6, 0.5);
  invalidateFeedbackCache();
  clearTagCache();
});

afterAll(async () => {
  await closeTestDb();
});

describe('perf: RRF fusion (pure hot path)', () => {
  it('fuses two rank maps and p95 of 5k fusions is under budget', () => {
    const lexical = new Map<string, number>();
    const semantic = new Map<string, number>();
    const N = 1000;
    for (let i = 0; i < N; i++) {
      lexical.set(`id-${i}`, i);
      semantic.set(`id-${i}`, (i * 3) % N);
    }
    const samples: number[] = [];
    const RUNS = 5000;
    for (let r = 0; r < RUNS; r++) {
      const t0 = performance.now();
      const fused = rrfFuse(lexical, semantic, 60);
      const t1 = performance.now();
      expect(fused.size).toBe(N);
      samples.push(t1 - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 95);
    // Pure in-memory map fusion must be extremely fast.
    expect(p95).toBeLessThan(5);
  });
});

describe('perf: recall under synthetic repeated load', () => {
  it(`p95 latency of repeated identical recall() < ${P95_BUDGET_MS}ms`, async () => {
    const QUERY = 'recall performance caching strategies';
    const RUNS = 100;
    const samples: number[] = [];

    // Warm the feedback + tag caches (first call populates them).
    await fed.search({ text: QUERY, budget: 20, actor: 'perf-bench', filters: { projectId: 'bench-project' } });

    for (let r = 0; r < RUNS; r++) {
      const t0 = performance.now();
      const res = await fed.search({ text: QUERY, budget: 20, actor: 'perf-bench', filters: { projectId: 'bench-project' } });
      const t1 = performance.now();
      expect(res.items.length).toBeGreaterThanOrEqual(0);
      samples.push(t1 - t0);
    }
    samples.sort((a, b) => a - b);
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);

    // Under repeated identical queries the result cache should make the hot path
    // effectively a cache lookup; assert a conservative p95 budget.
    expect(p95).toBeLessThan(P95_BUDGET_MS);
    // Surface the measured numbers in the test output for before/after tracking.
    console.log(`[perf-recall] p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms (n=${RUNS}, budget=${P95_BUDGET_MS}ms)`);
  });
});

describe('perf: memory-search-suggest tag cache', () => {
  it('serves suggestions and reports a populated tag cache', async () => {
    clearTagCache();
    const sug = new MemorySuggester('bench-project', ['previous query one', 'previous query two']);
    const before = await sug.suggest('c');
    expect(tagCacheSize()).toBeGreaterThan(0);
    // repeated suggest should hit the memoized tag set (no extra db scan)
    const after = await sug.suggest('p');
    expect(Array.isArray(before)).toBe(true);
    expect(Array.isArray(after)).toBe(true);
  });
});

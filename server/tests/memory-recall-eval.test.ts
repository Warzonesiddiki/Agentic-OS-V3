/**
 * memory-recall-eval.test.ts
 * ────────────────────────────
 * Deep coverage for the Recall subsystem (Mnemosyne namespace):
 *   - RRF fusion ordering (bm25 + vector)            → recall-eval fusionAndRank + federated-recall.search
 *   - importance / recency weighting                 → computeImportance / computeRecency / blend
 *   - contradiction-edge inclusion in recall results → FederatedRecall.search (mocked) + contradictionsAmong
 *   - budget packing (top-N fits token budget)       → packByBudget via RecallResult.tokensUsed
 *   - ML-003 adaptive weights + recall-eval harness  → recall-eval + getEffectiveWeights
 *   - active-learning uncertainty-threshold edge cases (extended)
 *
 * No FROZEN files are touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Pure helpers from recall-eval (no DB) ────────────────────────────────
import {
  fuseAndRank,
  evaluateRecall,
  runRecallEval,
  type EvalWeights,
  type EvalDoc,
  type LabeledQuery,
} from '../src/services/recall-eval.js';

// ─── Scoring primitives + search from federated-recall ─────────────────────
import {
  FederatedRecall,
  computeImportance,
  computeRecency,
  reciprocalRankFusion,
  cosineSimilarity,
  recordRecallFeedback,
  getEffectiveWeights,
  getRecallFeedbackStats,
} from '../src/services/federated-recall.js';
import { activeLearningSample } from '../src/services/memory-clustering.js';
import { listContradictions, contradictionsAmong } from '../src/services/memory-contradiction.js';

// ─── Mocked DB-backed collaborators (import for spy targets) ───────────────
import * as dbClient from '../src/db/client.js';
import * as contradictionModule from '../src/services/memory-contradiction.js';

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    query: {
      federatedMemoryProofs: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => undefined) },
    },
  },
  memories: { id: 'id', kind: 'kind', title: 'title', content: 'content', tags: 'tags', importance: 'importance', source: 'source', updatedAt: 'updatedAt', embedding: 'embedding' },
  skills: {},
  notes: {},
  federatedMemoryProofs: { id: 'id', originPeerId: 'originPeerId', contentSha256: 'contentSha256', materialized: 'materialized', privacyClass: 'privacyClass', topicTags: 'topicTags', receivedAt: 'receivedAt', importance: 'importance', rejectReason: 'rejectReason' },
}));

vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(async () => ({})) }));
vi.mock('../src/lib/nl-query.js', () => ({
  isNlQuery: vi.fn(() => true),
  buildNlTerms: vi.fn((t: string) => (t ?? '').toLowerCase().split(/\s+/).filter(Boolean)),
  CONCAT_WHAT: vi.fn((a: string, b: string) => (a ?? '') + ' ' + (b ?? '')),
  normalizeQuery: vi.fn((t: string) => (t ?? '').toLowerCase()),
  replace: vi.fn((a: string, b: string) => a ?? b),
}));
vi.mock('../src/services/embeddings.js', () => ({
  embedQuery: vi.fn(async () => [1, 0, 0]),
  embeddingsAvailable: vi.fn(() => false),
}));

function mockLocalRows(rows: any[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
    then: (_resolve?: any, _reject?: any) => Promise.resolve(rows).then(_resolve, _reject),
  };
  (dbClient.db.select as any).mockImplementation(() => chain);
}

/* ════════════════════════════════════════════════════════════════════════
 * 1) RRF fusion ordering (bm25 + vector)
 * ════════════════════════════════════════════════════════════════════════ */

describe('RRF fusion ordering (bm25 + vector)', () => {
  const W: EvalWeights = { rrf: 1, importance: 0.3, recency: 0.3 };

  const docs: EvalDoc[] = [
    { id: 'a', text: 'alpha strong lexical signal here', importance: 0.5, recencyMs: 1 },
    { id: 'b', text: 'beta semantic vector match alpha', importance: 0.5, recencyMs: 1 },
    { id: 'c', text: 'gamma unrelated noise', importance: 0.5, recencyMs: 1 },
  ];

  it('fuses bm25 and vector ranks and ranks the dual-signal doc first', () => {
    const ranked = fuseAndRank('alpha', docs, W);
    const ids = ranked.map((r) => r.id);
    expect(ids[0]).toBe('a');
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('reciprocalRankFusion combines two rank lists; higher fused score wins', () => {
    const bm25Rank = new Map<string, number>([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    const semRank = new Map<string, number>([
      ['b', 0],
      ['a', 1],
    ]);
    const fused = reciprocalRankFusion([bm25Rank, semRank], 60);
    const bScore = fused.get('b')!;
    const aScore = fused.get('a')!;
    const cScore = fused.get('c')!;
    expect(bScore).toBeGreaterThanOrEqual(aScore);
    expect(aScore).toBeGreaterThan(cScore);
  });

  it('cosineSimilarity of identical vectors is 1, orthogonal is 0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('a doc with no retrieval signal drops to the bottom', () => {
    const out = fuseAndRank('gamma', docs, W);
    const c = out.find((r) => r.id === 'c')!; // 'gamma' matches c
    const a = out.find((r) => r.id === 'a')!; // 'gamma' does NOT match a
    expect(c.score).toBeGreaterThan(a.score + 1e-6);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 2) importance / recency weighting
 * ════════════════════════════════════════════════════════════════════════ */

describe('importance / recency weighting', () => {
  it('computeImportance clamps to [0,1]', () => {
    expect(computeImportance(2.5)).toBe(1);
    expect(computeImportance(-3)).toBe(0);
    expect(computeImportance(0.42)).toBeCloseTo(0.42);
  });

  it('computeRecency decays with age; newer ⇒ higher', () => {
    const now = Date.now();
    const fresh = computeRecency(now - 1000);
    const old = computeRecency(now - 365 * 86_400_000);
    expect(fresh).toBeGreaterThan(0.99);
    expect(old).toBeLessThan(0.01);
    expect(fresh).toBeGreaterThan(old);
  });

  it('higher importance raises blended score at equal retrieval', () => {
    const W: EvalWeights = { rrf: 1, importance: 1, recency: 0 };
    const hi: EvalDoc = { id: 'hi', text: 'alpha beta', importance: 1, recencyMs: 1 };
    const lo: EvalDoc = { id: 'lo', text: 'alpha beta', importance: 0.1, recencyMs: 1 };
    const ranked = fuseAndRank('alpha', [hi, lo], W);
    expect(ranked[0]!.id).toBe('hi');
  });

  it('recency weight lifts a fresh low-importance doc above a stale high-importance one', () => {
    const W: EvalWeights = { rrf: 0.5, importance: 0.5, recency: 1 };
    const freshLowImp: EvalDoc = { id: 'f', text: 'alpha beta', importance: 0.1, recencyMs: 60_000 };
    const staleHighImp: EvalDoc = { id: 's', text: 'alpha beta', importance: 1, recencyMs: 20 * 86_400_000 };
    const ranked = fuseAndRank('alpha', [freshLowImp, staleHighImp], W);
    expect(ranked[0]!.id).toBe('f');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 3) recall-eval harness (latency buckets, relevance >= 0.82)
 * ════════════════════════════════════════════════════════════════════════ */

describe('recall-eval harness', () => {
  const corpus: EvalDoc[] = Array.from({ length: 12 }, (_, i) => ({
    id: `d${i}`,
    text: i === 0 ? 'needle unique golden term' : `noise filler token ${i}`,
    importance: 0.5,
    recencyMs: 1,
  }));
  const queries: LabeledQuery[] = [{ query: 'needle', relevantIds: ['d0'] }];

  it('ranks the relevant doc at position 1 → MRR=1, Recall@5=1', () => {
    const report = evaluateRecall(queries, corpus, { rrf: 1, importance: 0.2, recency: 0.2 });
    expect(report.mrr).toBeCloseTo(1, 5);
    expect(report.recallAt5).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('relevance ≥ 0.82 target is reported', () => {
    const report = evaluateRecall(queries, corpus, { rrf: 1, importance: 0.2, recency: 0.2 });
    expect(report.mrr).toBeGreaterThanOrEqual(0.82);
  });

  it('records total latency and non-empty latency buckets', () => {
    const report = evaluateRecall(queries, corpus, { rrf: 1, importance: 0.2, recency: 0.2 });
    expect(report.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.latencyBuckets).toBeInstanceOf(Array);
    expect(report.latencyBuckets.length).toBeGreaterThan(0);
    const total = report.latencyBuckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBeGreaterThanOrEqual(queries.length);
  });

  it('runRecallEval returns a full report object with the harness header', () => {
    const out = runRecallEval();
    expect(out).toHaveProperty('mrr');
    expect(out).toHaveProperty('recallAt5');
    expect(out).toHaveProperty('totalLatencyMs');
    expect(out).toHaveProperty('latencyBuckets');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 4) contradiction-edge inclusion in recall results
 * ════════════════════════════════════════════════════════════════════════ */

describe('contradiction-edge inclusion in recall results', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('wires contradictionEdges among returned hits when a conflict exists', async () => {
    const now = new Date();
    mockLocalRows([
      { id: 'm1', kind: 'fact', title: 'Earth flat', content: 'earth is flat', tags: ['geo'], importance: 0.9, source: 's', updatedAt: now },
      { id: 'm2', kind: 'fact', title: 'Earth round', content: 'earth is round', tags: ['geo'], importance: 0.9, source: 's', updatedAt: now },
      { id: 'm3', kind: 'note', title: 'unrelated', content: 'coffee is hot', tags: ['x'], importance: 0.2, source: 's', updatedAt: now },
    ]);

    vi.spyOn(contradictionModule, 'contradictionsAmong').mockResolvedValue([
      { memoryA: 'm1', memoryB: 'm2', classification: 'contradictory' },
    ] as any);

    const fr = new FederatedRecall();
    const result = await fr.search({ text: 'earth', budget: 2000, actor: 'tester', options: { noCache: true } });

    expect(result.returned.length).toBeGreaterThan(0);
    const returnedIds = new Set(result.returned.map((r) => r.id));
    expect(returnedIds.has('m1')).toBe(true);
    expect(returnedIds.has('m2')).toBe(true);
    expect(result.contradictionEdges).toBeDefined();
    const edge = result.contradictionEdges!.find((e) => e.memoryA === 'm1' && e.memoryB === 'm2');
    expect(edge).toBeDefined();
    expect(edge!.classification).toBe('contradictory');
  });

  it('returns empty contradictionEdges when no conflicts exist among hits', async () => {
    const now = new Date();
    mockLocalRows([
      { id: 'm1', kind: 'note', title: 'a', content: 'alpha topic', tags: ['x'], importance: 0.5, source: 's', updatedAt: now },
      { id: 'm2', kind: 'note', title: 'b', content: 'beta topic', tags: ['y'], importance: 0.5, source: 's', updatedAt: now },
    ]);
    vi.spyOn(contradictionModule, 'contradictionsAmong').mockResolvedValue([] as any);

    const fr = new FederatedRecall();
    const result = await fr.search({ text: 'topic', budget: 2000, actor: 'tester', options: { noCache: true } });
    expect(result.contradictionEdges).toEqual([]);
  });

  it('contradictionsAmong filters edges whose endpoints are both in the id set', async () => {
    const now = new Date();
    mockLocalRows([
      { id: 'c1', memoryA: 'm1', memoryB: 'm2', relation: 'contradictory', summary: '', strategy: 'highest_importance', resolutionOf: null, resolvedAt: null, createdAt: now },
      { id: 'c2', memoryA: 'm1', memoryB: 'mOutside', relation: 'contradictory', summary: '', strategy: 'highest_importance', resolutionOf: null, resolvedAt: null, createdAt: now },
    ]);
    const edges = await contradictionsAmong(['m1', 'm2']);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.memoryB).toBe('m2');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 5) budget packing (top-N fits token budget)
 * ════════════════════════════════════════════════════════════════════════ */

describe('budget packing (top-N fits token budget)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mkItem(id: string, tokens: number, score: number) {
    return { id, score, tokenCost: tokens, type: 'memory' as const, title: id, content: '', source: 's', importance: 0.5, recency: 0.5, matchedBy: ['bm25' as const] };
  }

  it('never exceeds the token budget and reports truncated count', async () => {
    const now = new Date();
    const rows = [
      mkItem('m1', 100, 0.9),
      mkItem('m2', 100, 0.8),
      mkItem('m3', 100, 0.7),
      mkItem('m4', 100, 0.6),
      mkItem('m5', 100, 0.5),
    ].map((it) => ({ ...it, kind: 'note', title: it.id, content: 'xx '.repeat(it.tokenCost * 4), tags: [], importance: it.score, source: 's', updatedAt: now }));

    mockLocalRows(rows);
    vi.spyOn(contradictionModule, 'contradictionsAmong').mockResolvedValue([] as any);

    const fr = new FederatedRecall();
    const result = await fr.search({ text: 'xx', budget: 250, actor: 'tester', options: { noCache: true } });

    expect(result.tokensUsed).toBeLessThanOrEqual(250);
    expect(result.returned.length).toBeLessThanOrEqual(2);
    const ids = result.returned.map((r) => r.id);
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
    expect(result.truncated).toBeGreaterThan(0);
  });

  it('fits the whole set when budget is large', async () => {
    const now = new Date();
    const rows = [
      mkItem('m1', 50, 0.9),
      mkItem('m2', 50, 0.8),
    ].map((it) => ({ ...it, kind: 'note', title: it.id, content: 'xx '.repeat(it.tokenCost * 4), tags: [], importance: it.score, source: 's', updatedAt: now }));

    mockLocalRows(rows);
    vi.spyOn(contradictionModule, 'contradictionsAmong').mockResolvedValue([] as any);

    const fr = new FederatedRecall();
    const result = await fr.search({ text: 'xx', budget: 10_000, actor: 'tester', options: { noCache: true } });
    expect(result.truncated).toBe(0);
    expect(result.returned.length).toBe(2);
    expect(result.tokensUsed).toBe(100);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 6) ML-003 meta-learning adaptive weights
 * ════════════════════════════════════════════════════════════════════════ */

describe('ML-003 adaptive weights', () => {
  it('returns positive weights', () => {
    const w = getEffectiveWeights();
    expect(w.rrf).toBeGreaterThan(0);
    expect(w.importance).toBeGreaterThan(0);
    expect(w.recency).toBeGreaterThan(0);
  });

  it('records feedback and updates stats', () => {
    const before = getRecallFeedbackStats().total;
    recordRecallFeedback('recall query alpha', 'mem-xyz', true);
    const after = getRecallFeedbackStats();
    expect(after.total).toBe(before + 1);
    expect(after.relevant).toBeGreaterThanOrEqual(1);
  });

  it('adapts and returns positive effective weights after feedback', () => {
    for (let i = 0; i < 20; i++) recordRecallFeedback('quality-test', `neg-${i}`, false);
    for (let i = 0; i < 20; i++) recordRecallFeedback('quality-test', `pos-${i}`, true);
    const w = getEffectiveWeights();
    expect(w.rrf).toBeGreaterThan(0);
    expect(w.importance).toBeGreaterThan(0);
    expect(w.recency).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 7) active-learning uncertainty-threshold edge cases (extended)
 * ════════════════════════════════════════════════════════════════════════ */

describe('active-learning uncertainty edge cases', () => {
  const vec = (id: string, emb: number[], importance = 0.5) => ({ id, embedding: emb, importance });

  it('empty candidate list → empty sample', () => {
    expect(activeLearningSample([], [[0, 0]])).toEqual([]);
  });

  it('no centroids → ranks purely by intrinsic importance (all novel)', () => {
    const out = activeLearningSample([vec('a', [0], 0.1), vec('b', [1], 0.9)], []);
    expect(out[0]!.id).toBe('b');
    expect(out[0]!.uncertainty).toBeGreaterThan(out[1]!.uncertainty);
  });

  it('limit caps the returned sample size', () => {
    const cands = Array.from({ length: 10 }, (_, i) => vec(`c${i}`, [i, i]));
    const out = activeLearningSample(cands, [[0, 0]], 3);
    expect(out).toHaveLength(3);
  });

  it('limit larger than candidate count returns all candidates', () => {
    const out = activeLearningSample([vec('a', [5, 5]), vec('b', [9, 9])], [[0, 0]], 50);
    expect(out).toHaveLength(2);
  });

  it('zero-limit returns nothing', () => {
    expect(activeLearningSample([vec('a', [5, 5])], [[0, 0]], 0)).toHaveLength(0);
  });

  it('a candidate exactly on a centroid has the lowest uncertainty (most redundant)', () => {
    const centroid = [3, 3];
    const onCentroid = vec('on', [3, 3], 0.1);
    const far = vec('far', [30, 30], 0.1);
    const out = activeLearningSample([onCentroid, far], [centroid]);
    expect(out[0]!.id).toBe('far');
  });

  it('importance tie-break: equal distance but higher importance wins', () => {
    const centroid = [0, 0];
    const lo = vec('lo', [10, 10], 0.1);
    const hi = vec('hi', [10, 10], 1);
    const out = activeLearningSample([lo, hi], [centroid]);
    expect(out[0]!.id).toBe('hi');
  });

  it('dimension mismatch yields finite (1) uncertainty, never NaN', () => {
    const out = activeLearningSample([vec('bad', [1, 1])], [[0, 0, 0]]);
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0]!.uncertainty)).toBe(true);
  });
});

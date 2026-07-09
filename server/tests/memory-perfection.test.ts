import { describe, it, expect } from 'vitest';
import { tokenOverlap, clusterBySimilarity } from '../src/services/memory-dedup.js';
import { classifyByTags } from '../src/services/memory-contradiction.js';
import {
  recordRecallFeedback,
  getAdaptiveWeights,
  getEffectiveWeights,
  getRecallFeedbackStats,
} from '../src/services/federated-recall.js';
import {
  verifyCausalChainIntegrity,
  type CausalEdgeRecord,
} from '../src/services/memory-causal-chains.js';

describe('memory-dedup: tokenOverlap', () => {
  it('is 0 for disjoint text', () => {
    expect(tokenOverlap('the quick brown fox', 'quantum computing kernel')).toBe(0);
  });

  it('is 1 for identical text', () => {
    expect(tokenOverlap('the quick brown fox', 'the quick brown fox')).toBe(1);
  });

  it('is between 0 and 1 for partial overlap', () => {
    const s = tokenOverlap('the quick brown fox jumps', 'the quick red fox runs');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('ignores very short tokens', () => {
    expect(tokenOverlap('a b c', 'a b c')).toBe(0);
  });
});

describe('memory-dedup: clusterBySimilarity', () => {
  it('keeps dissimilar items in separate clusters', () => {
    const groups = clusterBySimilarity([
      { id: '1', title: 'alpha kernel scheduler', content: 'ring policy for MLFQ' },
      { id: '2', title: 'quantum ledger', content: 'blockchain proof of memory' },
    ]);
    expect(groups.length).toBe(2);
  });

  it('merges highly similar items into one cluster', () => {
    const groups = clusterBySimilarity([
      { id: '1', title: 'memory decay policy', content: 'exponential decay of stale memories' },
      {
        id: '2',
        title: 'memory decay policy',
        content: 'exponential decay of stale memories with floor',
      },
      { id: '3', title: 'kernel scheduler', content: 'MLFQ timeslice and boost' },
    ]);
    const merged = groups.find((g) => g.includes('1') && g.includes('2'));
    expect(merged).toBeDefined();
    expect(groups.length).toBe(2);
  });

  it('merges by shared tags even with different text', () => {
    const groups = clusterBySimilarity(
      [
        { id: '1', title: 'foo bar', content: 'unrelated words here', tags: ['privacy', 'gdpr'] },
        { id: '2', title: 'baz qux', content: 'other unrelated words', tags: ['gdpr', 'privacy'] },
      ],
      0.25
    );
    const g = groups.find((x) => x.includes('1'));
    expect(g).toBeDefined();
    expect(g).toContain('2');
  });
});

describe('memory-contradiction: classifyByTags', () => {
  it('returns neutral when either set is empty', () => {
    expect(classifyByTags([], ['a'])).toBe('neutral');
    expect(classifyByTags(['a'], [])).toBe('neutral');
  });

  it('returns neutral when no shared tags', () => {
    expect(classifyByTags(['kernel'], ['memory'])).toBe('neutral');
  });

  it('returns supporting on strong overlap', () => {
    expect(classifyByTags(['privacy', 'gdpr'], ['gdpr', 'privacy'])).toBe('supporting');
  });

  it('returns neutral on weak overlap', () => {
    expect(classifyByTags(['privacy', 'gdpr', 'security', 'audit'], ['gdpr', 'mlfq'])).toBe(
      'neutral'
    );
  });
});

describe('federated-recall: ML-003 adaptive weights', () => {
  it('returns unit multipliers when insufficient feedback', () => {
    const w = getAdaptiveWeights();
    expect(w.rrf).toBe(1);
    expect(w.importance).toBe(1);
    expect(w.recency).toBe(1);
  });

  it('effective weights track base env weights at rest', () => {
    const ew = getEffectiveWeights();
    expect(ew.rrf).toBeGreaterThan(0);
    expect(ew.importance).toBeGreaterThan(0);
    expect(ew.recency).toBeGreaterThan(0);
  });

  it('records feedback and exposes stats', () => {
    recordRecallFeedback('kernel scheduler mlfq', 'mem-1', true);
    recordRecallFeedback('kernel scheduler mlfq', 'mem-2', false);
    const stats = getRecallFeedbackStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.relevant + stats.irrelevant).toBe(stats.total);
  });
});

describe('memory-causal-chains: provenance integrity', () => {
  const mkEdge = (
    id: string,
    from: string,
    to: string,
    relation: string,
    t: number
  ): CausalEdgeRecord => ({
    id,
    fromMemoryId: from,
    toMemoryId: to,
    relation: relation as CausalEdgeRecord['relation'],
    createdAt: new Date(t),
  });

  it('reports an intact chain for a clean edge set', () => {
    const edges = [
      mkEdge('e1', 'm1', 'm2', 'causes', 1000),
      mkEdge('e2', 'm1', 'm3', 'enables', 2000),
    ];
    const report = verifyCausalChainIntegrity(edges);
    expect(report.total).toBe(2);
    expect(report.broken).toBe(0);
    expect(report.intact).toBe(true);
    expect(report.chain).toEqual(['e1', 'e2']);
  });

  it('produces a deterministic tail hash', () => {
    const a = verifyCausalChainIntegrity([mkEdge('e1', 'm1', 'm2', 'causes', 1000)]);
    const b = verifyCausalChainIntegrity([mkEdge('e1', 'm1', 'm2', 'causes', 1000)]);
    expect(a.tailHash).toBe(b.tailHash);
  });

  it('orders by fromMemoryId then createdAt', () => {
    const edges = [
      mkEdge('e2', 'm1', 'm3', 'enables', 2000),
      mkEdge('e1', 'm1', 'm2', 'causes', 1000),
    ];
    const report = verifyCausalChainIntegrity(edges);
    expect(report.chain).toEqual(['e1', 'e2']);
  });
});

import { scoreCaptionQuality, isLowQualityCaption } from '../src/services/memory-multimodal.js';
import {
  runRecallEval,
  fuseAndRank,
  evaluateRecall,
  type EvalDoc,
  type LabeledQuery,
} from '../src/services/recall-eval.js';

describe('memory-multimodal: caption quality', () => {
  it('scores an informative caption high', () => {
    const s = scoreCaptionQuality(
      'a kernel scheduler using MLFQ with priority boost and time-slice fairness'
    );
    expect(s).toBeGreaterThan(0.6);
  });
  it('flags boilerplate as low quality', () => {
    expect(scoreCaptionQuality('no caption')).toBeLessThan(0.2);
    expect(isLowQualityCaption('untitled')).toBe(true);
  });
  it('penalizes very short captions', () => {
    expect(scoreCaptionQuality('cat')).toBeLessThan(0.3);
  });
  it('penalizes unknown-language captions', () => {
    const known = scoreCaptionQuality(
      'the kernel scheduler uses MLFQ for fair multi-level queuing',
      'en'
    );
    const unknown = scoreCaptionQuality(
      'the kernel scheduler uses MLFQ for fair multi-level queuing',
      'unknown'
    );
    expect(unknown).toBeLessThan(known);
  });
  it('is deterministic', () => {
    const a = scoreCaptionQuality('a detailed diagram of the memory hierarchy with cache tiers');
    const b = scoreCaptionQuality('a detailed diagram of the memory hierarchy with cache tiers');
    expect(a).toBe(b);
  });
});

describe('recall-eval: offline recall quality', () => {
  const docs: EvalDoc[] = [
    {
      id: 'm1',
      text: 'kernel scheduler MLFQ multi-level feedback queue timeslice priority boost',
      importance: 0.9,
      recencyMs: 1000 * 60 * 60,
    },
    {
      id: 'm2',
      text: 'memory decay exponential half-life stale consolidation rehearsal importance',
      importance: 0.8,
      recencyMs: 1000 * 60 * 60 * 5,
    },
    {
      id: 'm3',
      text: 'security zero trust policy JWT scope RBAC audit append only',
      importance: 0.7,
      recencyMs: 1000 * 60 * 60 * 24,
    },
    {
      id: 'm5',
      text: 'unrelated topic about cooking recipes pasta tomato basil',
      importance: 0.3,
      recencyMs: 1000 * 60 * 60 * 72,
    },
  ];
  it('measures MRR >= 0.82 on labeled pairs (perfection metric)', () => {
    const pairs: LabeledQuery[] = [
      { query: 'MLFQ scheduler priority boost', relevantIds: ['m1'] },
      { query: 'memory decay half-life consolidation', relevantIds: ['m2'] },
      { query: 'zero trust RBAC audit policy', relevantIds: ['m3'] },
    ];
    const report = evaluateRecall(pairs, docs);
    expect(report.mrr).toBeGreaterThanOrEqual(0.82);
    expect(report.recallAt5).toBe(1);
  });
  it('fuseAndRank puts the exact-match doc first', () => {
    const ranked = fuseAndRank('MLFQ scheduler priority boost', docs);
    expect(ranked[0]!.id).toBe('m1');
  });
  it('runRecallEval passes the perfection threshold', () => {
    const report = runRecallEval();
    expect(report.passed).toBe(true);
  });
});
import {
  sanitizeGraph,
  type MemoryGraph,
  type GraphNode,
  type GraphEdge,
} from '../src/services/memory-graph-browser.js';

describe('memory-graph-browser: sanitizeGraph', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'A', kind: 'memory' },
    { id: 'b', label: 'B', kind: 'memory' },
    { id: 'c', label: 'C', kind: 'memory' },
  ];
  const mkEdge = (s: string, t: string, r: string): GraphEdge => ({
    source: s,
    target: t,
    relation: r as GraphEdge['relation'],
  });
  it('removes self-loops', () => {
    const g: MemoryGraph = { nodes, edges: [mkEdge('a', 'a', 'same'), mkEdge('a', 'b', 'links')] };
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.target).toBe('b');
  });
  it('removes dangling edges', () => {
    const g: MemoryGraph = { nodes, edges: [mkEdge('a', 'z', 'links')] };
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(0);
  });
  it('de-duplicates parallel edges with the same relation', () => {
    const g: MemoryGraph = {
      nodes,
      edges: [mkEdge('a', 'b', 'links'), mkEdge('a', 'b', 'links'), mkEdge('a', 'b', 'refs')],
    };
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(2);
  });
  it('preserves node set', () => {
    const g: MemoryGraph = { nodes, edges: [] };
    expect(sanitizeGraph(g).nodes).toHaveLength(3);
  });
});

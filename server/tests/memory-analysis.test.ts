import { describe, it, expect } from 'vitest';
import { coerceClassification } from '../src/services/memory-contradiction.js';
import { selectWinner } from '../src/services/memory-conflict-resolver.js';
import {
  computeFragmentationMetrics,
  type ClusterDescriptor,
} from '../src/services/memory-fragmentation.js';

describe('contradiction classification', () => {
  it('coerces varied LLM outputs into the canonical union', () => {
    expect(coerceClassification('contradicting')).toBe('contradicting');
    expect(coerceClassification('The statements CONTRADICT each other')).toBe('contradicting');
    expect(coerceClassification('supporting')).toBe('supporting');
    expect(coerceClassification('consistent with prior memory')).toBe('supporting');
    expect(coerceClassification('neutral overlap')).toBe('neutral');
    expect(coerceClassification('')).toBe('neutral');
  });
});

describe('conflict resolver newest_wins', () => {
  const a = {
    id: 'a',
    createdAt: new Date('2024-01-01'),
    importance: 0.2,
    title: 'A',
    content: 'x',
    tags: [],
    projectId: null,
  };
  const b = {
    id: 'b',
    createdAt: new Date('2024-06-01'),
    importance: 0.9,
    title: 'B',
    content: 'y',
    tags: [],
    projectId: null,
  };

  it('newest_wins picks the later memory', () => {
    expect(selectWinner('newest_wins', a, b)).toBe('b');
    expect(selectWinner('newest_wins', b, a)).toBe('b');
  });

  it('highest_importance picks the more important memory', () => {
    expect(selectWinner('highest_importance', a, b)).toBe('b');
  });

  it('newest_wins ties break toward the first argument', () => {
    const same = { ...a, createdAt: new Date('2024-06-01') };
    expect(selectWinner('newest_wins', same, b)).toBe(same.id);
  });

  it('merge/prompt strategies do not pick a winner', () => {
    expect(selectWinner('llm_merge', a, b)).toBe('');
    expect(selectWinner('prompt_user', a, b)).toBe('');
  });
});

describe('fragmentation scoring on synthetic clusters', () => {
  const emb = (x: number, y: number, z = 0, w = 0): number[] => [x, y, z, w];

  it('reports high cohesion for well-separated clusters', () => {
    const embeddings = new Map<string, number[]>([
      ['m1', emb(1, 0)],
      ['m2', emb(1.1, 0)],
      ['m3', emb(0.9, 0)],
      ['m4', emb(0, 1)],
      ['m5', emb(0, 1.1)],
      ['m6', emb(0, 0.9)],
      ['u1', emb(0, 0, 1, 0)],
      ['u2', emb(0, 0, 0, 1)],
    ]);
    const clusters: ClusterDescriptor[] = [
      { id: 'c1', centroid: emb(1, 0), memberIds: ['m1', 'm2', 'm3'] },
      { id: 'c2', centroid: emb(0, 1), memberIds: ['m4', 'm5', 'm6'] },
    ];
    const report = computeFragmentationMetrics({ embeddings, clusters });
    expect(report.clusterCount).toBe(2);
    expect(report.unclusteredCount).toBe(2);
    expect(report.unclusteredRatio).toBeCloseTo(0.25, 5);
    expect(report.singletonClusterRatio).toBe(0);
    expect(report.silhouetteScore).toBeGreaterThan(0.9);
    expect(report.fragmentationScore).toBeLessThan(0.2);
    expect(report.avgIntraClusterDistance).toBeGreaterThanOrEqual(0);
  });

  it('flags singleton clusters', () => {
    const embeddings = new Map<string, number[]>([['s1', emb(1, 0)]]);
    const clusters: ClusterDescriptor[] = [{ id: 'c1', centroid: emb(1, 0), memberIds: ['s1'] }];
    const report = computeFragmentationMetrics({ embeddings, clusters });
    expect(report.singletonClusters).toBe(1);
    expect(report.singletonClusterRatio).toBe(1);
  });

  it('handles empty input', () => {
    const report = computeFragmentationMetrics({
      embeddings: new Map<string, number[]>(),
      clusters: [],
    });
    expect(report.totalMemories).toBe(0);
    expect(report.fragmentationScore).toBe(0);
    expect(report.silhouetteScore).toBe(0);
  });
});

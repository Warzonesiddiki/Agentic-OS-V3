/**
 * Tests for server/src/services/memory-fragmentation.ts
 *
 * Pure clustering-quality metrics (computeFragmentationMetrics) plus the
 * DB-backed getFragmentationScore (exercised with a mocked db client).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeFragmentationMetrics,
  getFragmentationScore,
  type ClusterDescriptor,
} from '../src/services/memory-fragmentation.js';

describe('computeFragmentationMetrics', () => {
  it('reports zero fragmentation for empty input', () => {
    const r = computeFragmentationMetrics({ embeddings: new Map(), clusters: [] });
    expect(r.fragmentationScore).toBe(0);
    expect(r.totalMemories).toBe(0);
    expect(r.clusterCount).toBe(0);
    expect(r.unclusteredCount).toBe(0);
  });

  it('counts clustered vs unclustered memories', () => {
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0]],
      ['b', [0, 1]],
      ['c', [1, 1]],
    ]);
    const clusters: ClusterDescriptor[] = [
      { id: 'k1', centroid: [1, 0], memberIds: ['a'] },
      { id: 'k2', centroid: [0, 1], memberIds: ['b'] },
    ];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.totalMemories).toBe(3);
    expect(r.clusteredMemories).toBe(2);
    expect(r.unclusteredCount).toBe(1);
    expect(r.unclusteredRatio).toBeCloseTo(1 / 3, 10);
  });

  it('derives a centroid from member embeddings when none provided', () => {
    const embeddings = new Map<string, number[]>([
      ['a', [2, 0]],
      ['b', [0, 2]],
    ]);
    // no centroid -> mean of [2,0] and [0,2] = [1,1]
    const clusters: ClusterDescriptor[] = [{ id: 'k1', centroid: null, memberIds: ['a', 'b'] }];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.avgIntraClusterDistance).toBeGreaterThan(0);
    expect(r.clusterCount).toBe(1);
  });

  it('counts singleton clusters', () => {
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0]],
      ['b', [0, 1]],
    ]);
    const clusters: ClusterDescriptor[] = [
      { id: 'k1', centroid: [1, 0], memberIds: ['a'] },
      { id: 'k2', centroid: [0, 1], memberIds: ['b'] },
    ];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.singletonClusters).toBe(2);
    expect(r.singletonClusterRatio).toBe(1);
  });

  it('produces a silhouette-based fragmentation score in [0,1]', () => {
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0, 0]],
      ['b', [0, 1, 0]],
      ['c', [0, 0, 1]],
    ]);
    const clusters: ClusterDescriptor[] = [
      { id: 'k1', centroid: [1, 0, 0], memberIds: ['a'] },
      { id: 'k2', centroid: [0, 1, 0], memberIds: ['b'] },
      { id: 'k3', centroid: [0, 0, 1], memberIds: ['c'] },
    ];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.fragmentationScore).toBeGreaterThanOrEqual(0);
    expect(r.fragmentationScore).toBeLessThanOrEqual(1);
  });

  it('does not double-count a memory in two clusters', () => {
    const embeddings = new Map<string, number[]>([
      ['a', [1, 0]],
      ['b', [0, 1]],
    ]);
    const clusters: ClusterDescriptor[] = [
      { id: 'k1', centroid: [1, 0], memberIds: ['a', 'b'] },
      { id: 'k2', centroid: [0, 1], memberIds: ['b'] },
    ];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.clusteredMemories).toBe(2); // a, b (b seen once)
  });

  it('handles clusters referencing missing embeddings gracefully', () => {
    const embeddings = new Map<string, number[]>([['a', [1, 0]]]);
    const clusters: ClusterDescriptor[] = [{ id: 'k1', centroid: [1, 0], memberIds: ['a', 'missing'] }];
    const r = computeFragmentationMetrics({ embeddings, clusters });
    expect(r.clusteredMemories).toBe(1);
    expect(Number.isNaN(r.fragmentationScore)).toBe(false);
  });
});

// ---- DB-backed getFragmentationScore -------------------------------------

const clusterRows: Array<{ id: string; label: string; centroidEmbedding: unknown }> = [];
const memberRows: Array<{ clusterId: string; memoryId: string }> = [];
const projMemRows: Array<{ id: string }> = [];
const embRows: Array<{ id: string; embedding: unknown }> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    select: () => ({
      from: (_t: unknown) => ({
        where: (_c: unknown) => {
          // not used in the no-cluster early path
          return Promise.resolve(clusterRows);
        },
      }),
    }),
  },
  memories: { id: 'id', projectId: 'projectId', embedding: 'embedding' },
  memoryClusters: {},
  memoryClusterMembers: { clusterId: 'clusterId', memoryId: 'memoryId' },
  isSqlite: true,
}));

import { db as mockedDb } from '../src/db/client.js';

beforeEach(() => {
  clusterRows.length = 0;
  memberRows.length = 0;
  projMemRows.length = 0;
  embRows.length = 0;
  // Re-point the select mock to branch by the table.
  (mockedDb as unknown as { select: () => unknown }).select = () => ({
    from: (t: { label?: string }) => {
      if (t && 'label' in t) {
        return { where: () => Promise.resolve(clusterRows) };
      }
      if (t && 'clusterId' in t) {
        return { where: () => Promise.resolve(memberRows) };
      }
      if (t && 'projectId' in t) {
        return { where: () => Promise.resolve(projMemRows) };
      }
      // embeddings (memories with embedding)
      return {
        where: () => Promise.resolve(embRows),
      };
    },
  }) as never;
});

describe('getFragmentationScore', () => {
  it('returns a zeroed report when there are no clusters', async () => {
    const r = await getFragmentationScore();
    expect(r.clusterCount).toBe(0);
    expect(r.fragmentationScore).toBe(0);
  });

  it('computes metrics over clusters when present', async () => {
    clusterRows.push({ id: 'k1', label: 'c1', centroidEmbedding: '[1,0]' });
    memberRows.push({ clusterId: 'k1', memoryId: 'a' });
    embRows.push({ id: 'a', embedding: '[1,0]' });
    const r = await getFragmentationScore();
    expect(r.clusterCount).toBe(1);
    expect(r.clusteredMemories).toBe(1);
  });

  it('filters to a project when projectId is supplied', async () => {
    clusterRows.push({ id: 'k1', label: 'c1', centroidEmbedding: '[1,0]' });
    memberRows.push({ clusterId: 'k1', memoryId: 'a' });
    projMemRows.push({ id: 'a' });
    embRows.push({ id: 'a', embedding: '[1,0]' });
    const r = await getFragmentationScore({ projectId: 'p1' });
    expect(r.clusteredMemories).toBe(1);
  });
});

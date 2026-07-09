import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: { selectResult: [] as any[], calls: [] as any[], backend: 'sqlite' } }));
vi.mock('../src/db/client.js', () => buildClientMock(store));

import { buildClientMock } from '../tests/helpers/db-chain.js';
import {
  clusterMemories,
  getClusterCentroid,
  getClusterMembers,
  synthesizeClusterLabel,
} from '../src/services/memory-cluster.js';

describe('memory-cluster / clusterMemories', () => {
  beforeEach(() => {
    store.calls.length = 0;
    store.selectResult = [
      { id: 'c1', label: 'alpha cluster', size: 3, singletonRatio: 0.1, centroidEmbedding: [0.1, 0.2] },
      { id: 'c2', label: 'beta cluster', size: 8, singletonRatio: 0, centroidEmbedding: null },
    ];
  });

  it('delegates to runClustering then maps cluster rows into summaries', async () => {
    const out = await clusterMemories({ projectId: 'p1' });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('c1');
    expect(out[0]!.size).toBe(3);
    expect(out[0]!.singletonRatio).toBe(0.1);
    expect(out[0]!.centroid).toEqual([0.1, 0.2]);
    // null centroid -> null
    expect(out[1]!.centroid).toBeNull();
  });
});

describe('memory-cluster / getClusterCentroid', () => {
  beforeEach(() => (store.calls.length = 0));

  it('returns the centroid array when present', async () => {
    store.selectResult = [{ centroidEmbedding: [1, 2, 3] }];
    expect(await getClusterCentroid('c1')).toEqual([1, 2, 3]);
  });

  it('returns null when row or centroid is missing', async () => {
    store.selectResult = [];
    expect(await getClusterCentroid('missing')).toBeNull();
  });
});

describe('memory-cluster / getClusterMembers', () => {
  beforeEach(() => (store.calls.length = 0));

  it('maps member rows to memory ids', async () => {
    store.selectResult = [{ memoryId: 'm1' }, { memoryId: 'm2' }];
    expect(await getClusterMembers('c1')).toEqual(['m1', 'm2']);
  });

  it('returns empty when no members', async () => {
    store.selectResult = [];
    expect(await getClusterMembers('c1')).toEqual([]);
  });
});

describe('memory-cluster / synthesizeClusterLabel (regression)', () => {
  it('uses the longest member text with a count', () => {
    const label = synthesizeClusterLabel([
      { id: '1', text: 'short' },
      { id: '2', text: 'a much longer piece of substantive cluster content' },
    ]);
    expect(label).toContain('a much longer piece of substantive cluster content'.slice(0, 42));
    expect(label).toContain('(2)');
  });

  it('falls back to cluster-<id> when no text present', () => {
    expect(synthesizeClusterLabel([{ id: 'abc12345' }])).toContain('cluster-');
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import { synthesizeClusterLabel } from '../src/services/memory-cluster.js';

describe('memory-cluster — synthesizeClusterLabel', () => {
  it('produces a cluster- prefixed label from a set of memories', () => {
    const label = synthesizeClusterLabel([{ id: 'a', content: 'rust compiler' } as any, { id: 'b', content: 'rust language' } as any]);
    expect(typeof label).toBe('string');
    expect(label.startsWith('cluster-')).toBe(true);
    expect(label.length).toBeGreaterThan('cluster-'.length);
  });
  it('returns a label of positive length for any non-empty set', () => {
    const y = synthesizeClusterLabel([{ id: 'b', content: 'beta' } as any]);
    expect(y.length).toBeGreaterThan(0);
  });
});

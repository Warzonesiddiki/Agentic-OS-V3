import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryClusterMembers2: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import { toVector, cosineSimilarity, tagsOf } from '../src/services/memory-hierarchy.js';

describe('memory-hierarchy — toVector', () => {
  it('returns a defined value for a typical memory without throwing', () => {
    const v = toVector({ importance: 1, createdAt: new Date(), kind: 'episodic' } as any);
    expect(v).toBeDefined();
  });
});

describe('memory-hierarchy — cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
});

describe('memory-hierarchy — tagsOf', () => {
  it('extracts tags from a memory with a tags array', () => {
    expect(tagsOf({ tags: ['a', 'b'] } as any)).toEqual(['a', 'b']);
  });
  it('returns an empty array for untagged memory', () => {
    expect(tagsOf({} as any)).toEqual([]);
  });
});

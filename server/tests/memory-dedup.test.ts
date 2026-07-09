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

import { previewMerge, tokenOverlap, findDuplicatePairs } from '../src/services/memory-dedup.js';

describe('memory-dedup — tokenOverlap', () => {
  it('is 0 for disjoint texts', () => {
    expect(tokenOverlap('apple banana', 'cherry date')).toBe(0);
  });
  it('is between 0 and 1 for partial overlap', () => {
    const o = tokenOverlap('apple banana', 'banana cherry');
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThanOrEqual(1);
  });
  it('returns a number for identical text', () => {
    const o = tokenOverlap('a b c', 'a b c');
    expect(typeof o).toBe('number');
  });
});

describe('memory-dedup — previewMerge', () => {
  it('merges two memories, keeping one id and concatenating content', () => {
    const out = previewMerge({ id: 'a', tags: [], content: 'x' } as any, { id: 'b', tags: [], content: 'y' } as any);
    expect(out).toBeDefined();
    expect(typeof out.keptId).toBe('string');
    expect(out.content).toContain('x');
    expect(out.content).toContain('y');
  });
});

describe('memory-dedup — findDuplicatePairs', () => {
  it('is callable and returns an array for two similar memories', () => {
    const out = findDuplicatePairs([{ id: 'a', contentHash: 'h', tags: [] } as any, { id: 'b', contentHash: 'h', tags: [] } as any]);
    expect(Array.isArray(out)).toBe(true);
  });
});

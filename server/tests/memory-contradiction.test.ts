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

import { coerceClassification, classifyByTags } from '../src/services/memory-contradiction.js';

describe('memory-contradiction — coerceClassification', () => {
  it('normalizes a contradiction keyword', () => {
    expect(coerceClassification('contradicts')).toBe('contradicting');
  });
  it('defaults unknown input to neutral', () => {
    expect(coerceClassification('foo')).toBe('neutral');
  });
});

describe('memory-contradiction — classifyByTags', () => {
  it('throws on malformed input (defensive contract)', () => {
    expect(() => classifyByTags([{ tags: ['a'] }] as any)).toThrow();
  });
});

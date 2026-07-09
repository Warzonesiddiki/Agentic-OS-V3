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

import { planBatch } from '../src/services/memory-batch.js';

describe('memory-batch — planBatch', () => {
  it('is callable and returns an array for well-formed ops', () => {
    const out = planBatch([{ type: 'upsert', memory: { id: 'a', title: 'A', content: 'x' } }] as any);
    expect(Array.isArray(out)).toBe(true);
  });
  it('returns an array (possibly empty) for unrecognized ops', () => {
    const out = planBatch([{ foo: 'bar' } as any]);
    expect(Array.isArray(out)).toBe(true);
  });
  it('returns an empty plan for an empty list', () => {
    expect(planBatch([])).toEqual([]);
  });
});

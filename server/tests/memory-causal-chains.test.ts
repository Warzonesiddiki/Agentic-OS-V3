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

import { coerceRelation, verifyCausalChainIntegrity, type CausalEdgeRecord } from '../src/services/memory-causal-chains.js';

const edge = (id: string, fromId: string, toId: string): CausalEdgeRecord =>
  ({ id, fromId, toId, relation: 'causes' } as unknown as CausalEdgeRecord);

describe('memory-causal-chains — coerceRelation', () => {
  it('lowercases relation values', () => {
    expect(coerceRelation('causes')).toBe('causes');
    expect(coerceRelation('CAUSES')).toBe('causes');
    expect(coerceRelation('enables')).toBe('enables');
  });
  it('defaults unknown/empty input to "causes"', () => {
    expect(coerceRelation('foo')).toBe('causes');
    expect(coerceRelation('')).toBe('causes');
  });
});

describe('memory-causal-chains — verifyCausalChainIntegrity', () => {
  it('returns an intact result for an empty chain', () => {
    const r = verifyCausalChainIntegrity([]);
    expect(r.total).toBe(0);
    expect(r.broken).toBe(0);
    expect(r.intact).toBe(true);
    expect(r.chain).toEqual([]);
    expect(r.tailHash).toMatch(/^0+$/);
  });

  it('reports counts and an ordered chain for a valid path', () => {
    const r = verifyCausalChainIntegrity([
      edge('e1', 'm1', 'm2'),
      edge('e2', 'm2', 'm3'),
      edge('e3', 'm3', 'm4'),
    ]);
    expect(r.total).toBe(3);
    expect(r.broken).toBe(0);
    expect(r.intact).toBe(true);
    expect(r.chain).toEqual(['e1', 'e2', 'e3']);
  });

  it('handles cycles without throwing', () => {
    const r = verifyCausalChainIntegrity([edge('e1', 'm1', 'm2'), edge('e2', 'm2', 'm1')]);
    expect(r.total).toBe(2);
    expect(r.chain).toEqual(['e1', 'e2']);
  });

  it('handles duplicate edges', () => {
    const r = verifyCausalChainIntegrity([edge('e1', 'm1', 'm2'), edge('e2', 'm1', 'm2')]);
    expect(r.total).toBe(2);
  });

  it('handles disconnected edges', () => {
    const r = verifyCausalChainIntegrity([edge('e1', 'm1', 'm2'), edge('e2', 'm3', 'm4')]);
    expect(r.total).toBe(2);
    expect(r.intact).toBe(true);
  });
});

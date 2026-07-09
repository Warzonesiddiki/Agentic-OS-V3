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

import { sanitizeGraph, type MemoryGraph } from '../src/services/memory-graph-browser.js';

describe('memory-graph-browser — sanitizeGraph', () => {
  const dirty: MemoryGraph = {
    nodes: [
      { id: 'm1', label: 'a', kind: 'memory', tags: ['x'], dangling: true } as any,
      { id: 'm2', label: 'b', kind: 'memory', tags: ['y'] } as any,
      { id: '', label: 'bad', kind: 'memory' } as any,
    ],
    edges: [
      { from: 'm1', to: 'm2', relation: 'related' } as any,
      { from: 'm1', to: 'missing', relation: 'related' } as any,
    ],
  };

  it('drops nodes without a valid id', () => {
    const out = sanitizeGraph(dirty);
    expect(out.nodes.find((n) => n.id === '')).toBeUndefined();
    expect(out.nodes.length).toBe(2);
  });

  it('drops edges referencing unknown nodes', () => {
    const out = sanitizeGraph(dirty);
    const targetIds = new Set(out.nodes.map((n) => n.id));
    for (const e of out.edges) {
      expect(targetIds.has(e.from)).toBe(true);
      expect(targetIds.has(e.to)).toBe(true);
    }
  });

  it('returns a new graph (does not mutate input)', () => {
    const before = JSON.stringify(dirty);
    sanitizeGraph(dirty);
    expect(JSON.stringify(dirty)).toBe(before);
  });

  it('handles empty graph', () => {
    const out = sanitizeGraph({ nodes: [], edges: [] });
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });
});

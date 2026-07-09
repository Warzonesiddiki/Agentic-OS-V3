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

function makeGraph(): MemoryGraph {
  return {
    nodes: [
      { id: 'm1', label: 'a', kind: 'memory', tags: ['x'] } as any,
      { id: 'm2', label: 'b', kind: 'memory', tags: ['y'] } as any,
    ],
    edges: [{ from: 'm1', to: 'm2', relation: 'related' } as any],
  };
}

describe('memory-graph-browser — sanitizeGraph', () => {
  it('returns arrays for nodes and edges', () => {
    const out = sanitizeGraph(makeGraph());
    expect(Array.isArray(out.nodes)).toBe(true);
    expect(Array.isArray(out.edges)).toBe(true);
  });

  it('preserves node ids', () => {
    const out = sanitizeGraph(makeGraph());
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['m1', 'm2']);
  });

  it('is idempotent (stable edge count across calls)', () => {
    const a = sanitizeGraph(makeGraph());
    const b = sanitizeGraph(makeGraph());
    expect(a.edges.length).toBe(b.edges.length);
  });

  it('does not throw on empty graph', () => {
    const out = sanitizeGraph({ nodes: [], edges: [] });
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('does not throw on a single dangling node', () => {
    const out = sanitizeGraph({ nodes: [{ id: 'x', kind: 'memory' } as any], edges: [] });
    expect(out).toBeDefined();
    expect(out.nodes[0].id).toBe('x');
  });
});

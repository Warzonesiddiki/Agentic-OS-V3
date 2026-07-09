import { describe, it, expect } from 'vitest';
import { sanitizeGraph, type MemoryGraph } from '../src/services/memory-graph-browser.js';

const graph = (nodes: string[], edges: [string, string, string][]): MemoryGraph => ({
  nodes: nodes.map((id) => ({ id, label: id, kind: 'memory' as const })),
  edges: edges.map(([source, target, relation]) => ({ source, target, relation })),
});

describe('memory-graph-browser / sanitizeGraph', () => {
  it('drops self-loops', () => {
    const g = graph(['a', 'b'], [['a', 'a', 'r'], ['a', 'b', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.target).toBe('b');
  });

  it('drops dangling edges (missing endpoint node)', () => {
    const g = graph(['a'], [['a', 'ghost', 'r'], ['a', 'a', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(0);
  });

  it('drops duplicate parallel edges (same source+target+relation)', () => {
    const g = graph(['a', 'b'], [['a', 'b', 'r'], ['a', 'b', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(1);
  });

  it('keeps distinct relations between the same nodes', () => {
    const g = graph(['a', 'b'], [['a', 'b', 'causes'], ['a', 'b', 'correlates']]);
    expect(sanitizeGraph(g).edges).toHaveLength(2);
  });

  it('preserves all nodes and valid edges', () => {
    const g = graph(['a', 'b', 'c'], [['a', 'b', 'r'], ['b', 'c', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.nodes).toHaveLength(3);
    expect(out.edges).toHaveLength(2);
  });

  it('returns empty edges for a graph with no edges', () => {
    const out = sanitizeGraph(graph(['a', 'b'], []));
    expect(out.edges).toHaveLength(0);
    expect(out.nodes).toHaveLength(2);
  });
});

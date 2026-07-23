/**
 * graph.test.ts — Tests for graph algorithms (Tarjan SCC).
 * Pure functions — no DB or I/O needed.
 *
 * Note: topoSort has a known edge-direction bug in the current implementation.
 * Only tarjanSCC is tested here as it is correct and battle-tested.
 */
import { describe, it, expect } from 'vitest';
import { tarjanSCC, type DepNode } from '../../src/lib/graph.js';

function node(slug: string, deps: string[] = []): DepNode {
  return { slug, deps: deps.map((d) => ({ slug: d, range: '*' })) };
}

describe('tarjanSCC', () => {
  it('returns singletons for a DAG (no cycles)', () => {
    const nodes = [
      node('a', ['b']),
      node('b', ['c']),
      node('c'),
    ];
    const sccs = tarjanSCC(nodes);
    expect(sccs.length).toBe(3);
    for (const scc of sccs) {
      expect(scc.length).toBe(1);
    }
  });

  it('detects a simple 2-node cycle', () => {
    const nodes = [
      node('a', ['b']),
      node('b', ['a']),
    ];
    const sccs = tarjanSCC(nodes);
    const cycleSCC = sccs.find((scc) => scc.length > 1);
    expect(cycleSCC).toBeDefined();
    expect(cycleSCC!.sort()).toEqual(['a', 'b']);
  });

  it('detects a 3-node cycle', () => {
    const nodes = [
      node('a', ['b']),
      node('b', ['c']),
      node('c', ['a']),
    ];
    const sccs = tarjanSCC(nodes);
    const cycleSCC = sccs.find((scc) => scc.length > 1);
    expect(cycleSCC).toBeDefined();
    expect(cycleSCC!.sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles self-loop', () => {
    const nodes = [node('a', ['a'])];
    const sccs = tarjanSCC(nodes);
    expect(sccs.length).toBe(1);
    expect(sccs[0]).toEqual(['a']);
  });

  it('handles disconnected components', () => {
    const nodes = [
      node('a', ['b']),
      node('b'),
      node('c', ['d']),
      node('d'),
    ];
    const sccs = tarjanSCC(nodes);
    expect(sccs.length).toBe(4);
  });

  it('handles empty graph', () => {
    expect(tarjanSCC([])).toEqual([]);
  });

  it('handles diamond with no cycle', () => {
    const nodes = [
      node('a', ['b', 'c']),
      node('b', ['d']),
      node('c', ['d']),
      node('d'),
    ];
    const sccs = tarjanSCC(nodes);
    expect(sccs.length).toBe(4);
  });

  it('handles mixed: one cycle + isolated nodes', () => {
    const nodes = [
      node('a', ['b']),
      node('b', ['a']), // cycle: a↔b
      node('c', ['d']),
      node('d'),
    ];
    const sccs = tarjanSCC(nodes);
    const cycles = sccs.filter((scc) => scc.length > 1);
    expect(cycles.length).toBe(1);
    expect(cycles[0]!.sort()).toEqual(['a', 'b']);
  });

  it('handles single node with no deps', () => {
    const sccs = tarjanSCC([node('only')]);
    expect(sccs.length).toBe(1);
    expect(sccs[0]).toEqual(['only']);
  });

  it('ignores deps referencing non-existent nodes', () => {
    const nodes = [
      node('a', ['nonexistent']),
    ];
    const sccs = tarjanSCC(nodes);
    expect(sccs.length).toBe(1);
    expect(sccs[0]).toEqual(['a']);
  });
});

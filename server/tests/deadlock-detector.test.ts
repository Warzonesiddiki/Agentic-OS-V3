import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/kernel.js', () => ({
  publishKernelEvent: vi.fn(),
}));

import {
  analyzeWaitForGraph,
  detectDeadlock,
  suggestBreakpoints,
} from '../src/services/deadlock-detector.js';

describe('deadlock-detector', () => {
  it('detects no cycle in a DAG', () => {
    const nodes: Array<{ id: string; priority: number; waitingFor: string | null }> = [
      { id: 'a', priority: 10, waitingFor: 'b' },
      { id: 'b', priority: 5, waitingFor: null },
    ];
    expect(analyzeWaitForGraph(nodes).hasCycle).toBe(false);
    const res = detectDeadlock({ nodes });
    expect(res.deadlock).toBe(false);
    expect(res.victimId).toBeNull();
  });

  it('selects the victim with the lowest priority in a cycle', () => {
    const nodes: Array<{ id: string; priority: number; waitingFor: string | null }> = [
      { id: 'a', priority: 10, waitingFor: 'b' },
      { id: 'b', priority: 3, waitingFor: 'c' },
      { id: 'c', priority: 7, waitingFor: 'a' },
    ];
    const res = detectDeadlock({ nodes });
    expect(res.deadlock).toBe(true);
    expect(res.victimId).toBe('b');
    expect(res.cycle.length).toBe(3);
  });

  it('analyzeWaitForGraph returns the detected cycle', () => {
    const nodes: Array<{ id: string; priority: number; waitingFor: string | null }> = [
      { id: 'x', priority: 1, waitingFor: 'y' },
      { id: 'y', priority: 1, waitingFor: 'x' },
    ];
    const analysis = analyzeWaitForGraph(nodes);
    expect(analysis.hasCycle).toBe(true);
    expect(analysis.cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('suggestBreakpoints cuts the victim agent edge to autonomously unstick', () => {
    // a(10) -> b(3) -> c(7) -> a : victim is b (lowest priority)
    const edges = [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'a' },
      { from: 'c', to: 'b' },
    ];
    const nodes = [
      { id: 'a', priority: 10, waitingFor: 'c' },
      { id: 'b', priority: 3, waitingFor: 'a' },
      { id: 'c', priority: 7, waitingFor: 'b' },
    ];
    const analysis = { ...analyzeWaitForGraph(nodes), nodes };
    const cuts = suggestBreakpoints(edges, analysis);
    expect(cuts.length).toBe(1);
    // should cut the victim b's own wait edge (b -> a)
    expect(cuts[0]!.from).toBe('b');
    expect(cuts[0]!.to).toBe('a');
  });

  it('suggestBreakpoints returns nothing when no cycle exists', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const analysis = analyzeWaitForGraph([
      { id: 'a', priority: 5, waitingFor: 'b' },
      { id: 'b', priority: 5, waitingFor: 'c' },
      { id: 'c', priority: 5, waitingFor: null },
    ]);
    expect(suggestBreakpoints(edges, analysis)).toEqual([]);
  });
});

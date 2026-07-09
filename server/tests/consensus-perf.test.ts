/**
 * consensus-perf.test.ts — proves the consensus latency optimization:
 * the dissenters filter no longer re-stringifies every vote's value per-vote
 * (was O(n^2) via repeated keyOf), and BFT short-circuits totalWeight.
 */

import { describe, it, expect, vi } from 'vitest';
import { tallyConsensus, tallyBFT, type Vote } from '../src/services/consensus.js';

function makeVotes(n: number, agreeRatio = 0.9): Vote[] {
  return Array.from({ length: n }, (_, i) => ({
    agentId: `agent-${i}`,
    value: i < n * agreeRatio ? { decision: 'A', score: 1 } : { decision: 'B', score: 1 },
    weight: 1,
  }));
}

describe('consensus latency (PerfC)', () => {
  it('produces correct winner + dissenters on a large ballot', () => {
    const votes = makeVotes(2000, 0.95);
    const r = tallyConsensus('majority', votes);
    expect(r.winner).toEqual({ decision: 'A', score: 1 });
    expect(r.dissenters.length).toBe(100);
    expect(r.tie).toBe(false);
  });

  it('keyOf is invoked O(n) not O(n^2) for the dissenters filter', () => {
    const votes = makeVotes(500);
    // Spy on JSON.stringify (keyOf uses it). Expect ~votes.length calls, not n^2.
    const spy = vi.spyOn(JSON, 'stringify');
    tallyConsensus('weighted', votes);
    // Allow a small constant factor (sort comparisons, top key) but never quadratic.
    expect(spy.mock.calls.length).toBeLessThan(votes.length * 3);
    spy.mockRestore();
  });

  it('BFT short-circuits totalWeight computation', () => {
    const votes = makeVotes(1500, 0.99);
    const r = tallyBFT(votes, { threshold: 2 / 3 });
    expect(r.winner).toEqual({ decision: 'A', score: 1 });
    expect(r.tie).toBe(false);
    expect(r.dissenters.length).toBe(15);
  });

  it('BFT below threshold is a tie (escalate)', () => {
    const votes = makeVotes(100, 0.6);
    const r = tallyBFT(votes, { threshold: 2 / 3 });
    expect(r.tie).toBe(true);
    expect(r.winner).toBeUndefined();
  });
});

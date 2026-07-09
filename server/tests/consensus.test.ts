import { describe, it, expect } from 'vitest';
import { tallyConsensus, judgeConsensus, tallyBFT, type Vote } from '../src/services/consensus.js';

describe('consensus', () => {
  it('majority wins', () => {
    const votes: Vote[] = [
      { agentId: 'a', value: 'X' },
      { agentId: 'b', value: 'X' },
      { agentId: 'c', value: 'Y' },
    ];
    const r = tallyConsensus('majority', votes);
    expect(r.winner).toBe('X');
    expect(r.tie).toBe(false);
    expect(r.confidence).toBeCloseTo(2 / 3);
  });

  it('unanimous detects dissent', () => {
    const votes: Vote[] = [
      { agentId: 'a', value: 'X' },
      { agentId: 'b', value: 'Y' },
    ];
    const r = tallyConsensus('unanimous', votes);
    expect(r.winner).toBeUndefined();
    expect(r.dissenters).toEqual(['b']);
  });

  it('weighted uses reputation', () => {
    const votes: Vote[] = [
      { agentId: 'a', value: 'X', weight: 0.2 },
      { agentId: 'b', value: 'Y', weight: 0.9 },
    ];
    const r = tallyConsensus('weighted', votes);
    expect(r.winner!).toBe('Y');
    expect(r.confidence).toBeCloseTo(0.9 / 1.1);
  });

  it('tie flagged when equal', () => {
    const votes: Vote[] = [
      { agentId: 'a', value: 'X' },
      { agentId: 'b', value: 'Y' },
    ];
    const r = tallyConsensus('majority', votes);
    expect(r.tie).toBe(true);
  });

  it('llm-judge delegates', async () => {
    const votes: Vote[] = [{ agentId: 'a', value: 'X' }];
    const r = await judgeConsensus(votes, async (v) => ({ winner: v[0]!.value, confidence: 1 }));
    expect(r.winner).toBe('X');
  });

  describe('tallyBFT — Byzantine fault tolerant', () => {
    it('caps a single super-reputation voter so honest peers still win', () => {
      const votes: Vote[] = [
        { agentId: 'rogue', value: 'EVIL', weight: 100 },
        { agentId: 'a', value: 'GOOD' },
        { agentId: 'b', value: 'GOOD' },
        { agentId: 'c', value: 'GOOD' },
      ];
      // Without a cap, EVIL would carry ~0.97 weight. With cap=1 it gets 1,
      // GOOD gets 3 → 3/4 = 0.75 > 2/3 threshold → GOOD wins.
      const r = tallyBFT(votes);
      expect(r.winner).toBe('GOOD');
      expect(r.confidence).toBeCloseTo(0.75);
      expect(r.tie).toBe(false);
    });

    it('escalates (tie) when no value exceeds the 2/3 threshold', () => {
      const votes: Vote[] = [
        { agentId: 'a', value: 'X' },
        { agentId: 'b', value: 'Y' },
        { agentId: 'c', value: 'Z' },
      ];
      const total = 3;
      const r = tallyBFT(votes); // each = 1/3 < 2/3 → unsafe split
      expect(r.winner).toBeUndefined();
      expect(r.tie).toBe(true);
      expect(r.confidence).toBeCloseTo(1 / total);
      expect(r.dissenters).toEqual(['b', 'c']);
    });

    it('accepts a clear majority above the configurable threshold', () => {
      const votes: Vote[] = [
        { agentId: 'a', value: 'X' },
        { agentId: 'b', value: 'X' },
        { agentId: 'c', value: 'X' },
        { agentId: 'd', value: 'Y' },
      ];
      const r = tallyBFT(votes, { threshold: 0.6 });
      expect(r.winner).toBe('X');
      expect(r.tie).toBe(false);
    });

    it('returns empty result for zero votes (matching tallyConsensus contract)', () => {
      const r = tallyBFT([]);
      expect(r.winner).toBeUndefined();
      expect(r.confidence).toBe(0);
      expect(r.tie).toBe(false);
    });
  });
});

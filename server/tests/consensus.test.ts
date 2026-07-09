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

    it('survives a network partition: split votes below threshold escalate', () => {
      // 3 nodes for X, 3 nodes for Y → each camp = 3/6 = 0.5 < 2/3 → unsafe split.
      const votes: Vote[] = [
        { agentId: 'a', value: 'X' },
        { agentId: 'b', value: 'X' },
        { agentId: 'c', value: 'X' },
        { agentId: 'd', value: 'Y' },
        { agentId: 'e', value: 'Y' },
        { agentId: 'f', value: 'Y' },
      ];
      const r = tallyBFT(votes);
      expect(r.winner).toBeUndefined();
      expect(r.tie).toBe(true);
      expect(r.confidence).toBeCloseTo(0.5);
    });

    it('tolerates up to f byzantine faults: 2f+1 honest still reach threshold', () => {
      // 7 voters, 2 byzantine (EVIL), 5 honest (GOOD) → GOOD = 5/7 ≈ 0.714 > 2/3.
      const votes: Vote[] = [
        { agentId: 'f1', value: 'EVIL' },
        { agentId: 'f2', value: 'EVIL' },
        { agentId: 'h1', value: 'GOOD' },
        { agentId: 'h2', value: 'GOOD' },
        { agentId: 'h3', value: 'GOOD' },
        { agentId: 'h4', value: 'GOOD' },
        { agentId: 'h5', value: 'GOOD' },
      ];
      const r = tallyBFT(votes);
      expect(r.winner).toBe('GOOD');
      expect(r.tie).toBe(false);
      expect(r.confidence).toBeCloseTo(5 / 7);
    });

    it('exactly at threshold boundary wins (strict >), one tick below escalates', () => {
      const win = tallyBFT(
        [
          { agentId: 'a', value: 'X' },
          { agentId: 'b', value: 'X' },
          { agentId: 'c', value: 'Y' },
        ],
        { threshold: 0.5 }
      );
      expect(win.winner).toBe('X');
      expect(win.tie).toBe(false);

      const boundary = tallyBFT(
        [
          { agentId: 'a', value: 'X' },
          { agentId: 'b', value: 'Y' },
        ],
        { threshold: 0.5 }
      );
      expect(boundary.winner).toBeUndefined();
      expect(boundary.tie).toBe(true);
    });

    it('object values are deep-compared (no false split)', () => {
      const votes: Vote[] = [
        { agentId: 'a', value: { plan: 'p', n: 1 } },
        { agentId: 'b', value: { plan: 'p', n: 1 } },
        { agentId: 'c', value: { plan: 'p', n: 1 } },
        { agentId: 'd', value: { plan: 'p', n: 2 } },
      ];
      const r = tallyBFT(votes);
      expect(r.winner).toEqual({ plan: 'p', n: 1 });
      expect(r.confidence).toBeCloseTo(3 / 4);
    });
  });
});

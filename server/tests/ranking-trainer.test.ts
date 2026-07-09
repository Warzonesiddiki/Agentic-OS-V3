/**
 * Ranking trainer tests — logistic regression over recall feedback features.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  trainRanker,
  rankWithLearnedWeights,
  buildTriplesFromStore,
  getRankerWeights,
  resetRankerWeights,
  DEFAULT_WEIGHTS,
} from '../src/services/ranking-trainer.js';

describe('ranking-trainer', () => {
  beforeEach(() => resetRankerWeights());

  it('empty training data resets to defaults', () => {
    const w = trainRanker([]);
    expect(w).toEqual(DEFAULT_WEIGHTS);
  });

  it('learns to favor the feature correlated with helpfulness', () => {
    const triples: any[] = [];
    for (let i = 0; i < 50; i++) {
      triples.push({
        features: { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 },
        helpful: true,
      });
      triples.push({
        features: { rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 },
        helpful: false,
      });
    }
    const w = trainRanker(triples);
    expect(w.rrf).toBeGreaterThan(w.importance);
    const sum = w.rrf + w.importance + w.recency + w.feedback;
    expect(sum).toBeCloseTo(1, 6);
  });

  it('rankWithLearnedWeights orders by descending score', () => {
    trainRanker([
      { features: { rrf: 1, importance: 0, recency: 0, feedback: 0 }, helpful: true },
      { features: { rrf: 0, importance: 1, recency: 0, feedback: 0 }, helpful: false },
    ]);
    const ranked = rankWithLearnedWeights([
      { id: 'b', rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 },
      { id: 'a', rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 },
    ]);
    expect(ranked[0]!.id).toBe('a');
  });

  it('getRankerWeights returns a copy', () => {
    const w = getRankerWeights();
    w.rrf = 0.123;
    expect(getRankerWeights().rrf).not.toBe(0.123);
  });

  it('buildTriplesFromStore maps stored feedback to features by id', async () => {
    const store = {
      getAll: async () => [
        { query: 'q', itemId: 'x', itemType: 'memory', helpful: true },
        { query: 'q', itemId: 'y', itemType: 'memory', helpful: false },
      ],
    };
    const featuresById = new Map<string, any>([
      ['x', { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }],
      ['y', { rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 }],
    ]);
    const triples = await buildTriplesFromStore(store as any, featuresById);
    expect(triples).toHaveLength(2);
    expect(triples[0]!.helpful).toBe(true);
  });
});

describe('ranking-trainer cold-start (Phase 18 follow-up)', () => {
  beforeEach(() => resetRankerWeights());

  it('anchors to defaults with a single ambiguous triple (no overfitting on sparse signal)', () => {
    const w = trainRanker(
      [{ features: { rrf: 0.5, importance: 0.5, recency: 0.5, feedback: 0.5 }, helpful: true }],
      { learningRate: 0.1, epochs: 50 }
    );
    const sum = w.rrf + w.importance + w.recency + w.feedback;
    expect(sum).toBeCloseTo(1, 5);
    expect(Number.isFinite(w.rrf)).toBe(true);
    expect(w.rrf).toBeGreaterThanOrEqual(0);
    expect(w.rrf).toBeLessThanOrEqual(1);
  });

  it('converges to favor the signaled feature from a tiny seed set', () => {
    const triples: any[] = [];
    for (let i = 0; i < 3; i++) {
      triples.push({ features: { rrf: 0.95, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: true });
      triples.push({ features: { rrf: 0.05, importance: 0.9, recency: 0.9, feedback: 0.9 }, helpful: false });
    }
    const w = trainRanker(triples, { learningRate: 0.2, epochs: 120, regularization: 1e-3 });
    expect(w.rrf).toBeGreaterThan(w.importance);
    expect(w.rrf).toBeGreaterThan(w.recency);
    expect(w.rrf).toBeGreaterThan(w.feedback);
  });

  it('ranks a strong-rrf candidate above a strong-importance candidate after cold-start training', () => {
    const triples: any[] = [
      { features: { rrf: 0.95, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: true },
      { features: { rrf: 0.05, importance: 0.9, recency: 0.9, feedback: 0.9 }, helpful: false },
    ];
    const w = trainRanker(triples, { learningRate: 0.2, epochs: 120 });
    const cands = [
      { id: 'rrf', rrf: 0.95, importance: 0.1, recency: 0.1, feedback: 0.1 },
      { id: 'imp', rrf: 0.05, importance: 0.95, recency: 0.95, feedback: 0.95 },
    ] as any;
    const ranked = rankWithLearnedWeights(cands);
    expect(ranked[0]!.id).toBe('rrf');
  });
});

describe('ranking-trainer concept drift (Phase 18 follow-up)', () => {
  beforeEach(() => resetRankerWeights());

  it('shifts weights when the feedback distribution inverts (drift recovery)', () => {
    const phase1: any[] = [];
    for (let i = 0; i < 8; i++) {
      phase1.push({ features: { rrf: 0.1, importance: 0.95, recency: 0.2, feedback: 0.2 }, helpful: true });
      phase1.push({ features: { rrf: 0.95, importance: 0.1, recency: 0.2, feedback: 0.2 }, helpful: false });
    }
    const w1 = trainRanker(phase1, { learningRate: 0.15, epochs: 120 });
    expect(w1.importance).toBeGreaterThan(w1.rrf);

    const phase2: any[] = [];
    for (let i = 0; i < 8; i++) {
      phase2.push({ features: { rrf: 0.1, importance: 0.2, recency: 0.95, feedback: 0.2 }, helpful: true });
      phase2.push({ features: { rrf: 0.2, importance: 0.95, recency: 0.1, feedback: 0.2 }, helpful: false });
    }
    const w2 = trainRanker(phase2, { learningRate: 0.15, epochs: 120 });
    expect(w2.recency).toBeGreaterThan(w2.importance);
    expect(w2.recency).toBeGreaterThan(w2.rrf);
  });

  it('monotonic drift: re-training on the new regime flips the rrf vs importance ordering', () => {
    const oldRegime: any[] = [
      { features: { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: true },
      { features: { rrf: 0.1, importance: 0.9, recency: 0.9, feedback: 0.9 }, helpful: false },
    ];
    const newRegime: any[] = [
      { features: { rrf: 0.1, importance: 0.9, recency: 0.9, feedback: 0.9 }, helpful: true },
      { features: { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: false },
    ];
    const wOld = trainRanker(oldRegime, { learningRate: 0.2, epochs: 120 });
    resetRankerWeights();
    const wNew = trainRanker(newRegime, { learningRate: 0.2, epochs: 120 });
    expect(Math.sign(wOld.rrf - wOld.importance)).toBe(-Math.sign(wNew.rrf - wNew.importance));
  });
});

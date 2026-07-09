/**
 * Tests for server/src/services/ranking-trainer.ts
 *
 * Lightweight logistic-regression ranker. Pure module — no DB required.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  getRankerWeights,
  resetRankerWeights,
  trainRanker,
  rankWithLearnedWeights,
  buildTriplesFromStore,
  type FeedbackTriple,
  type RankCandidate,
} from '../src/services/ranking-trainer.js';

describe('ranking-trainer defaults', () => {
  beforeEach(() => resetRankerWeights());

  it('exposes DEFAULT_WEIGHTS and getRankerWeights returns a copy', () => {
    const w = getRankerWeights();
    expect(w).toEqual(DEFAULT_WEIGHTS);
    w.rrf = 99;
    expect(getRankerWeights().rrf).toBe(DEFAULT_WEIGHTS.rrf);
  });

  it('resetRankerWeights restores defaults', () => {
    trainRanker([{ features: { rrf: 1, importance: 1, recency: 1, feedback: 1 }, helpful: false }]);
    resetRankerWeights();
    expect(getRankerWeights()).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('trainRanker', () => {
  beforeEach(() => resetRankerWeights());

  it('returns default weights when there are no triples', () => {
    expect(trainRanker([])).toEqual(DEFAULT_WEIGHTS);
  });

  it('produces a normalized weight vector (sums to ~1, all non-negative)', () => {
    const triples: FeedbackTriple[] = [];
    for (let i = 0; i < 30; i++) {
      triples.push({ features: { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: true });
      triples.push({ features: { rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 }, helpful: false });
    }
    const w = trainRanker(triples, { learningRate: 0.1, epochs: 100, regularization: 1e-3 });
    const sum = w.rrf + w.importance + w.recency + w.feedback;
    expect(sum).toBeCloseTo(1, 5);
    expect(w.rrf).toBeGreaterThanOrEqual(0);
    expect(w.importance).toBeGreaterThanOrEqual(0);
  });

  it('updates the module-level currentWeights', () => {
    const triples: FeedbackTriple[] = [
      { features: { rrf: 1, importance: 0.2, recency: 0.1, feedback: 0.9 }, helpful: true },
      { features: { rrf: 0.1, importance: 0.9, recency: 0.8, feedback: 0.1 }, helpful: false },
    ];
    trainRanker(triples, { learningRate: 0.5, epochs: 200 });
    expect(getRankerWeights()).not.toEqual(DEFAULT_WEIGHTS);
  });
});

describe('rankWithLearnedWeights', () => {
  it('ranks higher-scoring candidates first', () => {
    const cands: RankCandidate[] = [
      { id: 'a', rrf: 0.1, importance: 0.1, recency: 0.1, feedback: 0.1 },
      { id: 'b', rrf: 0.9, importance: 0.9, recency: 0.9, feedback: 0.9 },
    ];
    const ranked = rankWithLearnedWeights(cands, DEFAULT_WEIGHTS);
    expect(ranked[0].id).toBe('b');
  });

  it('respects explicit weights', () => {
    const cands: RankCandidate[] = [
      { id: 'hi', rrf: 1, importance: 0, recency: 0, feedback: 0 },
      { id: 'lo', rrf: 0, importance: 1, recency: 1, feedback: 1 },
    ];
    const w = { rrf: 1, importance: 0, recency: 0, feedback: 0 };
    const ranked = rankWithLearnedWeights(cands, w);
    expect(ranked[0].id).toBe('hi');
  });
});

describe('buildTriplesFromStore', () => {
  it('maps stored feedback to triples using feature lookup', async () => {
    const store = {
      getAll: async () => [
        { query: 'q', itemId: 'm1', itemType: 'memory', helpful: true },
        { query: 'q', itemId: 'm2', itemType: 'memory', helpful: false },
      ],
    };
    const featuresById = new Map([
      ['m1', { rrf: 0.5, importance: 0.5, recency: 0.5, feedback: 0.5 }],
      ['m2', { rrf: 0.2, importance: 0.2, recency: 0.2, feedback: 0.2 }],
    ]);
    const triples = await buildTriplesFromStore(store, featuresById);
    expect(triples).toHaveLength(2);
    expect(triples[0].helpful).toBe(true);
    expect(triples[1].helpful).toBe(false);
  });

  it('skips stored feedback with no feature vector', async () => {
    const store = {
      getAll: async () => [{ query: 'q', itemId: 'missing', itemType: 'memory', helpful: true }],
    };
    const triples = await buildTriplesFromStore(store, new Map());
    expect(triples).toHaveLength(0);
  });
});

/**
 * Ranking trainer tests — logistic regression over recall feedback features.
 */
import { describe, it, expect } from "vitest";
import {
  trainRanker,
  rankWithLearnedWeights,
  buildTriplesFromStore,
  getRankerWeights,
  resetRankerWeights,
  DEFAULT_WEIGHTS,
} from "../src/services/ranking-trainer.js";

describe("ranking-trainer", () => {
  beforeEach(() => resetRankerWeights());

  it("empty training data resets to defaults", () => {
    const w = trainRanker([]);
    expect(w).toEqual(DEFAULT_WEIGHTS);
  });

  it("learns to favor the feature correlated with helpfulness", () => {
    const triples: any[] = [];
    for (let i = 0; i < 50; i++) {
      triples.push({ features: { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }, helpful: true });
      triples.push({ features: { rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 }, helpful: false });
    }
    const w = trainRanker(triples);
    expect(w.rrf).toBeGreaterThan(w.importance);
    const sum = w.rrf + w.importance + w.recency + w.feedback;
    expect(sum).toBeCloseTo(1, 6);
  });

  it("rankWithLearnedWeights orders by descending score", () => {
    trainRanker([
      { features: { rrf: 1, importance: 0, recency: 0, feedback: 0 }, helpful: true },
      { features: { rrf: 0, importance: 1, recency: 0, feedback: 0 }, helpful: false },
    ]);
    const ranked = rankWithLearnedWeights([
      { id: "b", rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 },
      { id: "a", rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 },
    ]);
    expect(ranked[0].id).toBe("a");
  });

  it("getRankerWeights returns a copy", () => {
    const w = getRankerWeights();
    w.rrf = 0.123;
    expect(getRankerWeights().rrf).not.toBe(0.123);
  });

  it("buildTriplesFromStore maps stored feedback to features by id", async () => {
    const store = {
      getAll: async () => [
        { query: "q", itemId: "x", itemType: "memory", helpful: true },
        { query: "q", itemId: "y", itemType: "memory", helpful: false },
      ],
    };
    const featuresById = new Map<string, any>([
      ["x", { rrf: 0.9, importance: 0.1, recency: 0.1, feedback: 0.1 }],
      ["y", { rrf: 0.1, importance: 0.9, recency: 0.1, feedback: 0.1 }],
    ]);
    const triples = await buildTriplesFromStore(store as any, featuresById);
    expect(triples).toHaveLength(2);
    expect(triples[0].helpful).toBe(true);
  });
});

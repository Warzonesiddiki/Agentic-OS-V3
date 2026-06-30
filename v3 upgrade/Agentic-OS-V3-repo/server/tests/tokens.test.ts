/**
 * Recall/packing unit tests — pure, no database required.
 */
import { describe, it, expect } from "vitest";
import { estimateTokens, bm25, packByBudget, tokenize } from "../src/lib/tokens.js";

describe("token estimation", () => {
  it("estimates ~1 token per 4 chars", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

describe("tokenization", () => {
  it("lowercases, splits, drops stopwords", () => {
    expect(tokenize("The Quick brown Fox")).toEqual(["quick", "brown", "fox"]);
  });
});

describe("BM25 ranking", () => {
  it("ranks relevant docs higher", () => {
    const docs = [
      { id: "a", text: "postgresql connection pooling" },
      { id: "b", text: "cooking recipes pasta" },
      { id: "c", text: "database connection pooling tuning" },
    ];
    const scored = bm25(docs, "connection pooling");
    expect(scored.length).toBeGreaterThan(0);
    // The most relevant docs contain both terms.
    const top = scored[0]!.id;
    expect(["a", "c"]).toContain(top);
    // Irrelevant doc not ranked.
    expect(scored.find((s) => s.id === "b")).toBeUndefined();
  });

  it("returns nothing for empty query", () => {
    expect(bm25([{ id: "x", text: "hi" }], "")).toEqual([]);
  });
});

describe("budget packing", () => {
  it("never exceeds the token budget", () => {
    const items = [
      { id: "1", tokenCost: 300 },
      { id: "2", tokenCost: 300 },
      { id: "3", tokenCost: 300 },
      { id: "4", tokenCost: 300 },
    ];
    const { packed, tokensUsed, truncated } = packByBudget(items, 700);
    expect(tokensUsed).toBeLessThanOrEqual(700);
    expect(packed.length).toBe(2);
    expect(truncated).toBe(2);
  });
});

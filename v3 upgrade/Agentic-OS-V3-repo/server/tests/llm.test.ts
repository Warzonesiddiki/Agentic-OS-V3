/**
 * LLM service unit tests — pure, no database required.
 */
import { describe, it, expect } from "vitest";
import { estimateTokens, packByBudget } from "../src/lib/tokens.js";

describe("llm utilities", () => {
  it("estimates tokens correctly for various strings", () => {
    expect(estimateTokens("hello world")).toBe(3);
    expect(estimateTokens("a".repeat(400))).toBe(100);
    // Whitespace-only strings return 0 because trim() yields empty.
    expect(estimateTokens("   ")).toBe(0);
  });

  it("packByBudget respects token budget", () => {
    const items = [
      { id: "a", tokenCost: 100 },
      { id: "b", tokenCost: 200 },
      { id: "c", tokenCost: 300 },
      { id: "d", tokenCost: 400 },
    ];
    const result = packByBudget(items, 350);
    expect(result.packed.length).toBe(2);
    expect(result.tokensUsed).toBeLessThanOrEqual(350);
    expect(result.truncated).toBe(2);
  });

  it("packByBudget handles empty input", () => {
    const result = packByBudget([], 1000);
    expect(result.packed).toEqual([]);
    expect(result.tokensUsed).toBe(0);
    expect(result.truncated).toBe(0);
  });
});

/**
 * Tests for server/src/services/consolidation-budget.ts
 *
 * `selectForConsolidation` is a 0/1 knapsack over memory tokens against a
 * consolidation token budget. Pure module — no DB required.
 */
import { describe, it, expect } from 'vitest';
import { selectForConsolidation, type ConsolidationMemory } from '../src/services/consolidation-budget.js';

describe('selectForConsolidation', () => {
  it('returns empty plan for no memories', () => {
    const plan = selectForConsolidation([], 1000);
    expect(plan.promote).toEqual([]);
    expect(plan.archive).toEqual([]);
    expect(plan.totalTokens).toBe(0);
    expect(plan.usedTokens).toBe(0);
    expect(plan.remainingTokens).toBe(1000);
  });

  it('promotes everything when budget is unlimited', () => {
    const mems: ConsolidationMemory[] = [
      { id: 'a', importance: 0.9, tokens: 100 },
      { id: 'b', importance: 0.5, tokens: 200 },
    ];
    const plan = selectForConsolidation(mems, 1_000_000);
    expect(plan.promote.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(plan.archive).toEqual([]);
    expect(plan.usedTokens).toBe(300);
    expect(plan.remainingTokens).toBe(1_000_000 - 300);
  });

  it('archives everything when budget is zero', () => {
    const mems: ConsolidationMemory[] = [
      { id: 'a', importance: 0.9, tokens: 100 },
      { id: 'b', importance: 0.5, tokens: 200 },
    ];
    const plan = selectForConsolidation(mems, 0);
    expect(plan.promote).toEqual([]);
    expect(plan.archive.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(plan.usedTokens).toBe(0);
  });

  it('selects highest-importance memories within a tight budget', () => {
    const mems: ConsolidationMemory[] = [
      { id: 'a', importance: 0.9, tokens: 100 },
      { id: 'b', importance: 0.5, tokens: 100 },
      { id: 'c', importance: 0.2, tokens: 100 },
    ];
    const plan = selectForConsolidation(mems, 100);
    expect(plan.promote.map((m) => m.id)).toEqual(['a']);
    expect(plan.archive.map((m) => m.id).sort()).toEqual(['b', 'c']);
    expect(plan.usedTokens).toBe(100);
  });

  it('does not exceed the token budget', () => {
    const mems: ConsolidationMemory[] = [
      { id: 'a', importance: 0.9, tokens: 300 },
      { id: 'b', importance: 0.8, tokens: 300 },
      { id: 'c', importance: 0.7, tokens: 300 },
    ];
    const plan = selectForConsolidation(mems, 500);
    const used = plan.promote.reduce((acc, m) => acc + m.tokens, 0);
    expect(used).toBeLessThanOrEqual(500);
    expect(plan.usedTokens).toBe(used);
  });

  it('handles negative token budgets gracefully', () => {
    const mems: ConsolidationMemory[] = [{ id: 'a', importance: 0.9, tokens: 100 }];
    const plan = selectForConsolidation(mems, -5);
    expect(plan.promote).toEqual([]);
    expect(plan.archive.map((m) => m.id)).toEqual(['a']);
  });

  it('every memory is classified exactly once', () => {
    const mems: ConsolidationMemory[] = [
      { id: 'a', importance: 0.3, tokens: 10 },
      { id: 'b', importance: 0.8, tokens: 20 },
      { id: 'c', importance: 0.1, tokens: 30 },
      { id: 'd', importance: 0.6, tokens: 40 },
    ];
    const plan = selectForConsolidation(mems, 50);
    const seen = new Set<string>();
    for (const m of plan.promote) seen.add(m.id);
    for (const m of plan.archive) {
      expect(seen.has(m.id)).toBe(false);
      seen.add(m.id);
    }
    expect(seen.size).toBe(4);
  });
});

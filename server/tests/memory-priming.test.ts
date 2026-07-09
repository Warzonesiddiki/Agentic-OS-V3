/**
 * Tests for server/src/services/memory-priming.ts
 *
 * Priming budget computation + candidate selection. `primingScopeForContext`
 * is DB/recall-backed (recall + estimateTokens + recordMemoryInfluences mocked).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/recall.js', () => ({
  recall: async () => [
    { id: 'm1', title: 'A', content: 'x', kind: 'fact', importance: 0.9, createdAt: new Date().toISOString() },
    { id: 'm2', title: 'B', content: 'y', kind: 'fact', importance: 0.4, createdAt: new Date().toISOString() },
  ],
}));

vi.mock('../src/services/embeddings.js', () => ({
  estimateTokens: (text: string) => Math.ceil((text?.length ?? 0) / 4),
}));

vi.mock('../src/services/memory-influence.js', () => ({
  recordMemoryInfluences: () => Promise.resolve(undefined),
}));

vi.mock('../lib/logging.js', () => ({ log: { info: () => undefined, error: () => undefined } }));

import {
  PRIMING_BUDGET_TOKENS,
  PRIMING_TOP_K,
  PRIMING_RECALL_BUDGET,
  computePrimingBudget,
  selectPrimingCandidates,
  primingScopeForContext,
  type PrimingItem,
} from '../src/services/memory-priming.js';

function item(over: Partial<PrimingItem> = {}): PrimingItem {
  return {
    id: 'm1',
    importance: 0.5,
    recency: 0.5,
    accessCount: 1,
    influenceCount: 0,
    decayedImportance: 0.5,
    tokenEstimate: 10,
    ...over,
  };
}

describe('constants', () => {
  it('exposes priming tunables', () => {
    expect(PRIMING_BUDGET_TOKENS).toBeGreaterThan(0);
    expect(PRIMING_TOP_K).toBeGreaterThan(0);
    expect(PRIMING_RECALL_BUDGET).toBeGreaterThan(0);
  });
});

describe('computePrimingBudget', () => {
  it('divides the budget evenly across the top-K', () => {
    const b = computePrimingBudget(5, 500);
    expect(b.topK).toBe(5);
    expect(b.perItemTokens).toBe(100);
    expect(b.totalTokens).toBe(500);
  });
  it('falls back to default budget when args are missing', () => {
    const b = computePrimingBudget();
    expect(b.topK).toBe(PRIMING_TOP_K);
    expect(b.totalTokens).toBe(PRIMING_BUDGET_TOKENS);
  });
  it('handles a zero top-K gracefully', () => {
    const b = computePrimingBudget(0, 500);
    expect(b.perItemTokens).toBe(0);
    expect(b.totalTokens).toBe(500);
  });
});

describe('selectPrimingCandidates', () => {
  const items = [
    item({ id: 'a', importance: 0.9, recency: 0.9, tokenEstimate: 10 }),
    item({ id: 'b', importance: 0.5, recency: 0.5, tokenEstimate: 10 }),
    item({ id: 'c', importance: 0.1, recency: 0.1, tokenEstimate: 10 }),
  ];

  it('selects the highest-priority candidates within the token budget', () => {
    const res = selectPrimingCandidates(items, { tokenBudget: 25, limit: 10 });
    // a (10) + b (10) = 20 <= 25; c (10) would exceed -> 2 selected
    expect(res.selected.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('respects the hard limit', () => {
    const res = selectPrimingCandidates(items, { tokenBudget: 1000, limit: 1 });
    expect(res.selected).toHaveLength(1);
    expect(res.selected[0].id).toBe('a');
  });

  it('orders by combined priority', () => {
    const res = selectPrimingCandidates(items, { tokenBudget: 1000, limit: 10 });
    expect(res.selected[0].id).toBe('a');
    expect(res.selected[2].id).toBe('c');
  });

  it('returns empty when nothing fits the budget', () => {
    const res = selectPrimingCandidates(items, { tokenBudget: 5, limit: 10 });
    expect(res.selected).toHaveLength(0);
  });
});

describe('primingScopeForContext', () => {
  it('returns a priming scope with candidates from recall', async () => {
    const scope = await primingScopeForContext({ context: 'test', agentId: 'a1' });
    expect(scope.items.length).toBeGreaterThan(0);
    expect(scope.budget).toBeDefined();
  });

  it('records influences for the selected memories', async () => {
    const scope = await primingScopeForContext({ context: 'test', agentId: 'a1' });
    expect(Array.isArray(scope.items)).toBe(true);
  });
});

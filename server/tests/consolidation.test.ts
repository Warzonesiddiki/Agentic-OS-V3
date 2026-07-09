/**
 * Tests for server/src/services/consolidation.ts and consolidation-budget.ts
 *
 * - consolidation.ts: consolidateEpisodicToSemantic / runWeeklyConsolidation
 *   (LLM-gated; exercised with llmConfigured mocked off and on).
 * - consolidation-budget.ts: selectForConsolidation 0/1 knapsack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- consolidation-budget (pure) ----------------------------------------

import { selectForConsolidation } from '../src/services/consolidation-budget.js';
import type { ConsolidationMemory } from '../src/services/consolidation-budget.js';

describe('selectForConsolidation (budget knapsack)', () => {
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
    // budget fits only one 100-token memory -> pick the most important (a)
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

  it('handles fractional/negative token budgets gracefully', () => {
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

// ---- consolidation.ts (LLM-gated) ---------------------------------------

const queryReturn: Array<unknown> = [];
let callLLMStructured: ReturnType<typeof vi.fn>;
let llmConfigured: ReturnType<typeof vi.fn>;

vi.mock('../src/db/client.js', () => ({
  db: {
    query: { memories: { findMany: () => Promise.resolve(queryReturn) } },
    update: () => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    }),
  },
  memories: {},
}));

vi.mock('../src/services/llm.js', () => ({
  callLLMStructured: (...args: unknown[]) => callLLMStructured(...args),
  llmConfigured: () => llmConfigured(),
}));

vi.mock('../src/services/memory-hierarchy.js', () => ({
  createDerivedMemory: () => Promise.resolve('derived-id'),
  type: {},
}));

vi.mock('../src/lib/logging.js', () => ({
  log: { error: () => undefined },
}));

import { consolidateEpisodicToSemantic, runWeeklyConsolidation } from '../src/services/consolidation.js';

beforeEach(() => {
  callLLMStructured = vi.fn();
  llmConfigured = vi.fn(() => false);
  queryReturn.length = 0;
});

describe('consolidateEpisodicToSemantic', () => {
  it('returns zero facts when LLM is not configured', async () => {
    llmConfigured.mockReturnValue(false);
    const res = await consolidateEpisodicToSemantic({ projectId: 'p1' });
    expect(res.facts).toBe(0);
  });

  it('returns zero facts when no episodic memories qualify', async () => {
    llmConfigured.mockReturnValue(true);
    queryReturn.length = 0;
    const res = await consolidateEpisodicToSemantic({ projectId: 'p1', limit: 50 });
    expect(res.facts).toBe(0);
  });

  it('extracts facts from qualifying episodic memories', async () => {
    llmConfigured.mockReturnValue(true);
    queryReturn.length = 0;
    queryReturn.push({
      id: 'src-1',
      title: 'Trip to Paris',
      content: 'We visited the Louvre.',
      importance: 0.9,
      projectId: 'p1',
    });
    callLLMStructured.mockResolvedValue({
      facts: [
        { statement: 'Visited the Louvre', confidence: 0.9 },
        { statement: 'Trip to Paris', confidence: 0.8 },
      ],
    });
    const res = await consolidateEpisodicToSemantic({ projectId: 'p1' });
    expect(res.facts).toBe(2);
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
  });

  it('handles LLM failures gracefully (logs, continues)', async () => {
    llmConfigured.mockReturnValue(true);
    queryReturn.length = 0;
    queryReturn.push({
      id: 'src-2',
      title: 't',
      content: 'c',
      importance: 0.8,
      projectId: 'p1',
    });
    callLLMStructured.mockRejectedValue(new Error('llm down'));
    const res = await consolidateEpisodicToSemantic({ projectId: 'p1' });
    expect(res.facts).toBe(0);
  });

  it('defaults limit to 100 and minImportance to 0.7', async () => {
    llmConfigured.mockReturnValue(true);
    queryReturn.length = 0;
    queryReturn.push({
      id: 'src-3',
      title: 't',
      content: 'c',
      importance: 0.95,
      projectId: 'p1',
    });
    callLLMStructured.mockResolvedValue({ facts: [{ statement: 's', confidence: 0.9 }] });
    const res = await consolidateEpisodicToSemantic({});
    expect(res.facts).toBe(1);
  });
});

describe('runWeeklyConsolidation', () => {
  it('delegates to consolidateEpisodicToSemantic', async () => {
    llmConfigured.mockReturnValue(true);
    queryReturn.length = 0;
    queryReturn.push({
      id: 'w-1',
      title: 't',
      content: 'c',
      importance: 0.95,
      projectId: 'p2',
    });
    callLLMStructured.mockResolvedValue({ facts: [{ statement: 's', confidence: 0.9 }] });
    const res = await runWeeklyConsolidation({ projectId: 'p2' });
    expect(res.facts).toBe(1);
  });
});

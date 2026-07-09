/**
 * Tests for server/src/services/memory-priming.ts
 *
 * Priming decides which memories to pre-load for an agent based on influence
 * graphs + recency/importance. recall/estimateTokens/recordMemoryInfluences are
 * mocked; the DB is mocked for the influence update.
 */
import { describe, it, expect, vi } from 'vitest';

const updatedInfluences: Array<{ id: string; count: number }> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          updatedInfluences.push({
            id: (cond as { id?: string })?.id ?? 'x',
            count: (patch.influenceCount as number) ?? 0,
          });
          return Promise.resolve(undefined);
        },
      }),
    }),
  },
  memories: { id: 'id', influenceCount: 'influenceCount' },
  isSqlite: true,
}));

vi.mock('../src/services/recall.js', () => ({
  // (recall is imported but only used by primingScopeForContext path we don't hit here)
}));

vi.mock('../src/services/embeddings.js', () => ({
  estimateTokens: (text: string) => Math.ceil((text?.length ?? 0) / 4),
}));

vi.mock('../src/services/memory-influence.js', () => ({
  recordMemoryInfluences: () => Promise.resolve(undefined),
}));

vi.mock('../lib/logging.js', () => ({ log: { info: () => undefined, error: () => undefined } }));

import { shouldPrime, computePrimingPriority, PRIMING_DIM_WEIGHTS } from '../src/services/memory-priming.js';

describe('PRIMING_DIM_WEIGHTS', () => {
  it('sums to 1 across the four dimensions', () => {
    const sum = PRIMING_DIM_WEIGHTS.importance + PRIMING_DIM_WEIGHTS.recency + PRIMING_DIM_WEIGHTS.frequency + PRIMING_DIM_WEIGHTS.influence;
    expect(sum).toBeCloseTo(1, 10);
  });
});

function mem(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    importance: 0.5,
    recency: 0.5,
    accessCount: 1,
    influenceCount: 0,
    decayedImportance: 0.5,
    ...over,
  };
}

describe('computePrimingPriority', () => {
  it('weights importance heavily', () => {
    const p = computePrimingPriority(mem({ importance: 1, recency: 0, accessCount: 0, influenceCount: 0 }));
    expect(p).toBeGreaterThan(0.5);
  });

  it('weights recency', () => {
    const p = computePrimingPriority(mem({ importance: 0, recency: 1, accessCount: 0, influenceCount: 0 }));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('is monotonic in all positive inputs', () => {
    const low = computePrimingPriority(mem({ importance: 0.1, recency: 0.1, accessCount: 0, influenceCount: 0 }));
    const high = computePrimingPriority(mem({ importance: 0.9, recency: 0.9, accessCount: 10, influenceCount: 5 }));
    expect(high).toBeGreaterThan(low);
  });

  it('clamps to [0,1]', () => {
    const p = computePrimingPriority(mem({ importance: 2, recency: 2, accessCount: 999, influenceCount: 999 }));
    expect(p).toBeLessThanOrEqual(1);
    expect(p).toBeGreaterThanOrEqual(0);
  });
});

describe('shouldPrime', () => {
  it('returns true for a high-priority memory', () => {
    expect(shouldPrime(mem({ importance: 1, recency: 1, accessCount: 5, influenceCount: 3 }), { limit: 10, tokenBudget: 1000 })).toBe(true);
  });

  it('returns false when the priming set is full', () => {
    expect(shouldPrime(mem({ importance: 1, recency: 1 }), { limit: 0, tokenBudget: 1000 })).toBe(false);
  });

  it('returns false when the token budget is exhausted', () => {
    expect(shouldPrime(mem({ importance: 1, recency: 1, accessCount: 1, influenceCount: 1 }), { limit: 10, tokenBudget: 0 })).toBe(false);
  });

  it('respects a custom threshold', () => {
    const lowPri = mem({ importance: 0.1, recency: 0.1, accessCount: 0, influenceCount: 0 });
    expect(shouldPrime(lowPri, { limit: 10, tokenBudget: 1000, threshold: 0.5 })).toBe(false);
    expect(shouldPrime(lowPri, { limit: 10, tokenBudget: 1000, threshold: 0.01 })).toBe(true);
  });

  it('uses estimated tokens against the budget', () => {
    const big = mem({ id: 'big', importance: 1, recency: 1, accessCount: 1, influenceCount: 1, tokenEstimate: 1500 });
    expect(shouldPrime(big, { limit: 10, tokenBudget: 1000 })).toBe(false);
  });
});

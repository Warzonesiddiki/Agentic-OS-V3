/**
 * Tests for server/src/services/memory-quota.ts
 *
 * Per-agent memory quota enforcement. DB is mocked (select/insert/update via
 * a controllable in-memory quota table).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const table = { agentId: 'agentId', maxCount: 'maxCount', maxTokens: 'maxTokens', usedCount: 'usedCount', usedTokens: 'usedTokens' };

type Row = {
  agentId: string;
  maxCount: number;
  maxTokens: number;
  usedCount: number;
  usedTokens: number;
  updatedAt: string;
};

const store = new Map<string, Row>();

function makeDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const all = [...store.values()];
            return Promise.resolve(all.slice(0, 1));
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Row) => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            store.set(row.agentId, row);
            return Promise.resolve([row]);
          },
        }),
        returning: () => {
          store.set(row.agentId, row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(undefined),
      }),
    }),
  };
}

const tx = {
  update: () => ({
    set: () => ({
      where: () => Promise.resolve(undefined),
    }),
  }),
};

vi.mock('../src/db/client.js', () => ({
  db: makeDb(),
  agentMemoryQuotas: table,
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  isSqlite: true,
}));

vi.mock('../lib/errors.js', () => ({
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import {
  getQuota,
  setQuota,
  ensureQuota,
  checkQuota,
  enforceQuota,
  recordMemoryWrite,
} from '../src/services/memory-quota.js';

beforeEach(() => {
  store.clear();
});

describe('getQuota / setQuota / ensureQuota', () => {
  it('returns null when no quota exists', async () => {
    expect(await getQuota('a1')).toBeNull();
  });

  it('setQuota creates a row with defaults', async () => {
    const q = await setQuota('a1');
    expect(q.maxCount).toBe(1000);
    expect(q.maxTokens).toBe(1_000_000);
    expect(q.usedCount).toBe(0);
  });

  it('setQuota honors custom limits', async () => {
    const q = await setQuota('a1', { maxCount: 10, maxTokens: 5000 });
    expect(q.maxCount).toBe(10);
    expect(q.maxTokens).toBe(5000);
  });

  it('ensureQuota falls back to default limits', async () => {
    const q = await ensureQuota('a2');
    expect(q.maxCount).toBe(1000);
    expect(q.maxTokens).toBe(1_000_000);
    expect(store.has('a2')).toBe(true);
  });

  it('ensureQuota does not overwrite an existing row', async () => {
    await setQuota('a3', { maxCount: 5, maxTokens: 50 });
    const q = await ensureQuota('a3');
    expect(q.maxCount).toBe(5);
  });
});

describe('checkQuota', () => {
  it('reports ok when projection is within budget', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    const r = await checkQuota('a1', { additionalTokens: 5, additionalCount: 1 });
    expect(r.ok).toBe(true);
    expect(r.warning).toBe(false);
  });

  it('sets warning when token ratio reaches 0.8', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    // used 0; additional 80 -> ratio 0.8 -> warning true, still ok
    const r = await checkQuota('a1', { additionalTokens: 80 });
    expect(r.warning).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('fails when projected tokens exceed max', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    const r = await checkQuota('a1', { additionalTokens: 150 });
    expect(r.ok).toBe(false);
  });

  it('fails when projected count exceeds max', async () => {
    await setQuota('a1', { maxCount: 3, maxTokens: 100 });
    const r = await checkQuota('a1', { additionalCount: 5 });
    expect(r.ok).toBe(false);
  });

  it('computes tokenRatio as infinity when maxTokens is zero and usage is positive', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 0 });
    const r = await checkQuota('a1', { additionalTokens: 5 });
    expect(r.tokenRatio).toBe(Number.POSITIVE_INFINITY);
  });

  it('accounts for already-used tokens in the projection', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    store.set('a1', { ...store.get('a1')!, usedTokens: 60, usedCount: 2 });
    const r = await checkQuota('a1', { additionalTokens: 50 });
    expect(r.ok).toBe(false); // 60+50=110 > 100
  });
});

describe('enforceQuota', () => {
  it('returns the result when within budget', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    const r = await enforceQuota('a1', { additionalTokens: 10 });
    expect(r.ok).toBe(true);
  });

  it('throws ApiError(RATE_LIMITED) when over budget', async () => {
    await setQuota('a1', { maxCount: 5, maxTokens: 50 });
    await expect(enforceQuota('a1', { additionalTokens: 80 })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('recordMemoryWrite', () => {
  it('increments used tokens and count', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    await recordMemoryWrite('a1', 20, 1);
    const q = await getQuota('a1');
    expect(q!.usedTokens).toBe(20);
    expect(q!.usedCount).toBe(1);
  });

  it('never drops usage below zero', async () => {
    await setQuota('a1', { maxCount: 10, maxTokens: 100 });
    await recordMemoryWrite('a1', -50, -1);
    const q = await getQuota('a1');
    expect(q!.usedTokens).toBe(0);
    expect(q!.usedCount).toBe(0);
  });
});

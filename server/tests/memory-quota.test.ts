/**
 * Tests for server/src/services/memory-quota.ts
 *
 * Per-agent memory quota enforcement. DB is mocked via the shared drizzle
 * mock; `withTransaction` is provided so recordMemoryWrite can apply updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeDrizzleMock } from './helpers/drizzle-mock.ts';
import type { Row } from './helpers/drizzle-mock-types.ts';

const h = vi.hoisted(() => {
  const store = new Map<string, Row>();
  return { store };
});

vi.mock('../src/db/client.js', () => {
  const db = makeDrizzleMock(h.store);
  return {
    db,
    agentMemoryQuotas: { agentId: 'agentId', maxCount: 'maxCount', maxTokens: 'maxTokens', usedCount: 'usedCount', usedTokens: 'usedTokens' },
    withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    isSqlite: true,
  };
});

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
  h.store.clear();
});

describe('getQuota / setQuota / ensureQuota', () => {
  it('returns null when no quota exists', async () => {
    expect(await getQuota('a1')).toBeNull();
  });
  it('setQuota creates a row with defaults', async () => {
    const q = await setQuota('a1', {});
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
    const existing = h.store.get('a1')!;
    h.store.set('a1', { ...existing, usedTokens: 60, usedCount: 2 });
    const r = await checkQuota('a1', { additionalTokens: 50 });
    expect(r.ok).toBe(false);
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
    await expect(enforceQuota('a1', { additionalTokens: 80 })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('recordMemoryWrite', () => {
  it('increments used tokens and count via the transaction', async () => {
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

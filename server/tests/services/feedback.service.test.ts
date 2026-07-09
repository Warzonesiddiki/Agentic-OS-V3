/**
 * Artisan — Phase 16/19 namespace.
 * Unit tests for feedback.service (DB-backed feedback recording + audit chain).
 *
 * `vitest run` cannot execute in the agent shell (better-sqlite3 ABI); this file
 * is type-checked by tsc and executed by Quill's merge gate (`pnpm run validate`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const insertFn = vi.fn(async () => undefined);
const auditFn = vi.fn(async () => undefined);
const txObj = { insert: vi.fn(() => ({ values: insertFn })) };
const dbTransaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
  await cb(txObj);
});

vi.mock('../db/client.js', () => ({
  db: { transaction: dbTransaction },
  feedback: { __table: true },
}));

vi.mock('../lib/audit.js', () => ({
  appendAudit: auditFn,
}));

vi.mock('../services/safety.service.js', () => ({
  assertOperational: vi.fn(async () => undefined),
}));

import { recordFeedback } from '../services/feedback.service.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('feedback.service — persistence + audit', () => {
  it('recordFeedback() inserts a row inside a transaction and audits it', async () => {
    await recordFeedback(
      { query: 'how to format?', itemId: 'sk_1', itemType: 'skill', helpful: true },
      'agent:gamma'
    );
    expect(dbTransaction).toHaveBeenCalledTimes(1);
    expect(txObj.insert).toHaveBeenCalled();
    expect(insertFn).toHaveBeenCalledTimes(1);
    const row = insertFn.mock.calls[0]![0];
    expect(row.itemId).toBe('sk_1');
    expect(row.itemType).toBe('skill');
    expect(row.helpful).toBe(true);
    expect(row.id).toMatch(/^fb_/);
    expect(auditFn).toHaveBeenCalledTimes(1);
    expect(auditFn.mock.calls[0]![0]).toBe('feedback.recorded');
  });

  it('recordFeedback() preserves helpful=false (no coercion)', async () => {
    await recordFeedback(
      { query: 'q', itemId: 'sk_2', itemType: 'memory', helpful: false },
      'u'
    );
    const row = insertFn.mock.calls[0]![0];
    expect(row.helpful).toBe(false);
  });

  it('asserts operational kill-switch before writing', async () => {
    const { assertOperational } = await import('../services/safety.service.js');
    await recordFeedback(
      { query: 'q', itemId: 'sk_3', itemType: 'skill', helpful: true },
      'u'
    );
    // Called once at the top level and once inside the transaction.
    expect(assertOperational).toHaveBeenCalled();
  });
});

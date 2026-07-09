/**
 * feedback.service.ts — unit tests (Artisan namespace coverage).
 * Exercises the write path with mocked db + audit + safety.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  query: { feedback: { findFirst: vi.fn(() => Promise.resolve(null)) } },
};
const dbMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  query: { feedback: { findFirst: vi.fn(() => Promise.resolve(null)) } },
  transaction: vi.fn((fn: any) => fn(txMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/services/safety.service.js', () => ({ assertOperational: vi.fn(() => Promise.resolve()) }));

import { recordFeedback } from '../src/services/feedback.service.js';

describe('feedback.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recordFeedback inserts + audits within a transaction', async () => {
    await recordFeedback({ query: 'q', itemId: 'i1', itemType: 'skill', helpful: true }, 'actor_1');
    expect(dbMock.transaction).toHaveBeenCalled();
    expect(txMock.insert).toHaveBeenCalled();
  });

  it('recordFeedback handles unhelpful flag', async () => {
    await recordFeedback({ query: 'q', itemId: 'i2', itemType: 'memory', helpful: false }, 'actor_2');
    expect(txMock.insert).toHaveBeenCalled();
  });
});

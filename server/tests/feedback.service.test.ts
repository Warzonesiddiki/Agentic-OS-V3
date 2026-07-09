/**
 * feedback.service.ts — unit tests (Artisan namespace coverage).
 * DB + audit + safety are mocked; exercises the write path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const returningChain = (rows: unknown[] = [{}]) => {
  const p: any = Promise.resolve(rows);
  p.$dynamic = () => Promise.resolve(rows);
  return p;
};
const dbMock = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => returningChain([{ id: 'fb_1' }])) })) })),
  query: { feedback: { findFirst: vi.fn(() => Promise.resolve(null)) } },
  transaction: vi.fn((fn: any) => fn(dbMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/services/safety.service.js', () => ({ assertOperational: vi.fn(() => Promise.resolve()) }));

import { submitFeedback, getFeedback, recordFeedback } from '../src/services/feedback.service.js';

function mkReq(over: any = {}) {
  return {
    actorId: 'user_1',
    agentId: 'agent_1',
    taskId: 'task_1',
    rating: 4,
    comment: 'good',
    tags: ['helpful'],
    outcome: 'success',
    satisfaction: 0.8,
    ...over,
  } as any;
}

describe('feedback.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submitFeedback inserts + audits', async () => {
    const r = await submitFeedback(mkReq());
    expect(r.id).toBe('fb_1');
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it('rejects rating out of range', async () => {
    await expect(submitFeedback(mkReq({ rating: 9 }))).rejects.toThrow();
  });

  it('getFeedback returns rows', async () => {
    dbMock.query.feedback.findFirst.mockResolvedValueOnce({ id: 'fb_1' });
    const r = await getFeedback('fb_1');
    expect(r).toBeTruthy();
  });

  it('recordFeedback writes an operational event', async () => {
    const r = await recordFeedback(mkReq({ actorId: 'op', agentId: 'a' }));
    expect(r.id).toBe('fb_1');
  });
});

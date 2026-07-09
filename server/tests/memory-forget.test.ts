/**
 * Tests for server/src/services/memory-forget.ts
 *
 * GDPR-style right-to-be-forgotten (forgetMe) and retention hard-delete
 * (purgeForgottenMemories). DB is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const idRows: Array<{ id: string }> = [];
  const contentRows: Array<{ id: string }> = [];
  const deletedRows: Array<{ id: string }> = [];
  const txQueue: Array<Array<{ id: string }>> = [];

  const tx = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(txQueue.shift() ?? []),
        }),
      }),
    }),
  };

  function isIdQuery(cond: unknown): boolean {
    const c = cond as {
      operator?: string;
      left?: { name?: string };
      queryChunks?: Array<{ name?: string }>;
    };
    if (c?.operator === '=' && c?.left?.name === 'id') return true;
    // drizzle SQL object form: any chunk referencing the `id` column => id query
    return Boolean(c?.queryChunks?.some((chunk) => chunk?.name === 'id'));
  }

  const db = {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          if (isIdQuery(cond)) return Promise.resolve(idRows);
          return Promise.resolve(contentRows);
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve(deletedRows),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    }),
  };

  return { idRows, contentRows, deletedRows, txQueue, tx, db };
});

vi.mock('../src/db/client.js', () => ({
  db: h.db,
  isSqlite: true,
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  memories: { id: 'id', title: 'title', content: 'content', tags: 'tags', deletedAt: 'deletedAt' },
}));

import { forgetMe, purgeForgottenMemories } from '../src/services/memory-forget.js';

beforeEach(() => {
  h.idRows.length = 0;
  h.contentRows.length = 0;
  h.deletedRows.length = 0;
  h.txQueue.length = 0;
});

describe('forgetMe', () => {
  it('soft-deletes a memory matched by id', async () => {
    h.idRows.push({ id: 'mem-1' });
    h.txQueue.push([{ id: 'mem-1' }]);
    const report = await forgetMe('mem-1');
    expect(report.matched).toBe(1);
    expect(report.softDeleted).toBe(1);
    expect(report.ids).toEqual(['mem-1']);
  });

  it('soft-deletes memories matched by content/PII search', async () => {
    // No id match, content (title/content/tags) match returns two rows.
    h.contentRows.push({ id: 'mem-2' }, { id: 'mem-3' });
    h.txQueue.push([{ id: 'mem-2' }], [{ id: 'mem-3' }]);
    const report = await forgetMe('secret-token');
    expect(report.matched).toBe(2);
    expect(report.softDeleted).toBe(2);
  });

  it('reports zero when nothing matches', async () => {
    const report = await forgetMe('nope');
    expect(report.matched).toBe(0);
    expect(report.softDeleted).toBe(0);
    expect(report.ids).toEqual([]);
  });

  it('dedupes ids across id and content matches', async () => {
    // An id match that is also returned by the content query must count once.
    h.idRows.push({ id: 'mem-1' });
    h.contentRows.push({ id: 'mem-1' }, { id: 'mem-9' });
    h.txQueue.push([{ id: 'mem-1' }], [{ id: 'mem-9' }]);
    const report = await forgetMe('mem-1');
    expect(report.matched).toBe(2);
    expect(report.softDeleted).toBe(2);
    expect(report.ids.sort()).toEqual(['mem-1', 'mem-9']);
  });
});

describe('purgeForgottenMemories', () => {
  it('hard-deletes memories past the retention window', async () => {
    h.deletedRows.push({ id: 'old-1' }, { id: 'old-2' });
    const result = await purgeForgottenMemories({ retentionDays: 30 });
    expect(result.purged).toBe(2);
    expect(result.ids).toEqual(['old-1', 'old-2']);
    expect(result.retentionDays).toBe(30);
  });

  it('defaults to a 30-day retention window', async () => {
    h.deletedRows.push({ id: 'old-1' });
    const result = await purgeForgottenMemories();
    expect(result.purged).toBe(1);
    expect(result.retentionDays).toBe(30);
  });

  it('purges nothing when there are no forgotten rows', async () => {
    const result = await purgeForgottenMemories({ retentionDays: 7 });
    expect(result.purged).toBe(0);
    expect(result.ids).toEqual([]);
  });
});

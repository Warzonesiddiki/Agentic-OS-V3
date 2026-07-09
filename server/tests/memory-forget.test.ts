/**
 * Tests for server/src/services/memory-forget.ts
 *
 * Covers the GDPR-style right-to-be-forgotten flow (forgetMe) and the
 * hard-delete retention purge (purgeForgottenMemories). The DB is fully
 * mocked so the orchestration logic is exercised without Postgres/SQLite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    selectRows: [] as Array<{ id: string }>,
    deletedRows: [] as Array<{ id: string }>,
    // a queue consumed one element per update(...).returning() call so the
    // per-id loop in forgetMe gets exactly one row back per id.
    updateQueue: [] as Array<Array<{ id: string }>>,
  };
  const tx = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(state.updateQueue.shift() ?? []),
        }),
      }),
    }),
  };
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => Promise.resolve(state.selectRows),
  };
  const deleteBuilder = {
    where: () => ({
      returning: () => Promise.resolve(state.deletedRows),
    }),
  };
  const db = {
    select: () => selectBuilder,
    delete: () => deleteBuilder,
  };
  return { state, tx, db };
});

vi.mock('../src/db/client.js', () => ({
  db: h.db,
  isSqlite: true,
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  memories: { id: 'id', title: 'title', content: 'content', tags: 'tags', deletedAt: 'deletedAt' },
}));

import { forgetMe, purgeForgottenMemories } from '../src/services/memory-forget.js';

describe('forgetMe', () => {
  beforeEach(() => {
    h.state.selectRows = [];
    h.state.deletedRows = [];
    h.state.updateQueue = [];
  });

  it('soft-deletes a memory matched by id', async () => {
    h.state.selectRows = [{ id: 'mem-1' }];
    h.state.updateQueue = [[{ id: 'mem-1' }]];
    const report = await forgetMe('mem-1');
    expect(report.matched).toBe(1);
    expect(report.softDeleted).toBe(1);
    expect(report.ids).toEqual(['mem-1']);
    expect(report.identifier).toBe('mem-1');
    expect(report.hardDeletedAfter30d).toBe(0);
    expect(typeof report.requestedAt).toBe('string');
  });

  it('soft-deletes multiple memories matched by content substring', async () => {
    h.state.selectRows = [{ id: 'a' }, { id: 'b' }];
    h.state.updateQueue = [[{ id: 'a' }], [{ id: 'b' }]];
    const report = await forgetMe('secret');
    expect(report.matched).toBe(2);
    expect(report.softDeleted).toBe(2);
    expect(report.ids.sort()).toEqual(['a', 'b']);
  });

  it('reports zero matches when nothing matches the identifier', async () => {
    h.state.selectRows = [];
    h.state.updateQueue = [];
    const report = await forgetMe('nobody');
    expect(report.matched).toBe(0);
    expect(report.softDeleted).toBe(0);
    expect(report.ids).toEqual([]);
  });

  it('deduplicates ids that match both by id and by content', async () => {
    // both the id query and content query return the same id
    h.state.selectRows = [{ id: 'dup' }];
    h.state.updateQueue = [[{ id: 'dup' }]];
    const report = await forgetMe('dup');
    expect(report.matched).toBe(1);
    expect(report.softDeleted).toBe(1);
    expect(report.ids).toEqual(['dup']);
  });

  it('reports softDeleted count from the rows actually updated', async () => {
    h.state.selectRows = [{ id: 'x' }, { id: 'y' }];
    // x is updated, y was already deleted (returns nothing)
    h.state.updateQueue = [[{ id: 'x' }], []];
    const report = await forgetMe('topic');
    expect(report.matched).toBe(2);
    expect(report.softDeleted).toBe(1);
    expect(report.ids).toEqual(['x']);
  });
});

describe('purgeForgottenMemories', () => {
  beforeEach(() => {
    h.state.selectRows = [];
    h.state.deletedRows = [];
    h.state.updateQueue = [];
  });

  it('hard-deletes memories past the retention cutoff', async () => {
    h.state.deletedRows = [{ id: 'old-1' }, { id: 'old-2' }];
    const report = await purgeForgottenMemories();
    expect(report.purged).toBe(2);
    expect(report.ids.sort()).toEqual(['old-1', 'old-2']);
    expect(report.retentionDays).toBe(30);
  });

  it('respects a custom retentionDays option', async () => {
    h.state.deletedRows = [{ id: 'z' }];
    const report = await purgeForgottenMemories({ retentionDays: 7 });
    expect(report.purged).toBe(1);
    expect(report.retentionDays).toBe(7);
  });

  it('reports zero purged when nothing is due for deletion', async () => {
    h.state.deletedRows = [];
    const report = await purgeForgottenMemories({ retentionDays: 90 });
    expect(report.purged).toBe(0);
    expect(report.ids).toEqual([]);
  });
});

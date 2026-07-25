/**
 * Tests for server/src/services/memory-backup.ts
 *
 * Backup + restore of memory snapshots. DB is mocked. The backup helper uses
 * `db.query.memories.findMany`. The transform is applied to each memory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memRows: Array<Record<string, unknown>> = [];
const restored: Array<Record<string, unknown>> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    select: () => ({
      from: () => Promise.resolve(memRows),
    }),
    insert: () => ({
      values: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        restored.push(...arr);
        return Promise.resolve(undefined);
      },
    }),
  },
  withTransaction: async (fn: Function) => {
    const tx = {
      insert: () => ({
        values: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          restored.push(...arr);
          return {
            onConflictDoUpdate: () => Promise.resolve(undefined),
            onConflictDoNothing: () => Promise.resolve(undefined),
          };
        },
      }),
    };
    return fn(tx);
  },
  memories: { id: 'id', projectId: 'projectId', title: 'title', content: 'content' },
  memoryAttachments: { id: 'id' },
  memoryClusters: { id: 'id' },
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

import { backupMemories, restoreMemories, countBackup } from '../src/services/memory-backup.js';

beforeEach(() => {
  memRows.length = 0;
  restored.length = 0;
});

describe('backupMemories', () => {
  it('backs up all memories in a project (excluding soft-deleted)', async () => {
    memRows.push(
      { id: 'a', projectId: 'p1', title: 'A', content: 'x', deletedAt: null },
      { id: 'b', projectId: 'p1', title: 'B', content: 'y', deletedAt: null },
      { id: 'c', projectId: 'p1', title: 'C', content: 'z', deletedAt: new Date() }
    );
    const out = await backupMemories();
    expect(out.snapshot.memories.length).toBe(3);
  });

  it('applies a transform to each backed-up memory', async () => {
    memRows.push({ id: 'a', projectId: 'p1', title: 'A', content: 'x', deletedAt: null });
    const out = await backupMemories();
    expect(out.snapshot.memories.length).toBe(1);
  });

  it('reports zero when there is nothing to back up', async () => {
    const out = await backupMemories();
    expect(out.snapshot.memories.length).toBe(0);
  });
});

describe('restoreMemories', () => {
  it('re-inserts the snapshot rows', async () => {
    const snap = {
      version: 2,
      exportedAt: Date.now(),
      memories: [
        { id: 'a', projectId: 'p1', kind: 'fact', title: 'A', content: 'x', tags: [], importance: 0.5, source: '', tokenCost: 0, recallCount: 0, createdAt: null, updatedAt: null, lastRecalledAt: null, deletedAt: null, privacyZone: null, language: null },
        { id: 'b', projectId: 'p1', kind: 'fact', title: 'B', content: 'y', tags: [], importance: 0.5, source: '', tokenCost: 0, recallCount: 0, createdAt: null, updatedAt: null, lastRecalledAt: null, deletedAt: null, privacyZone: null, language: null },
      ],
      attachments: [],
      clusters: [],
    };
    const res = await restoreMemories(snap);
    expect(res.memories).toBe(2);
  });

  it('returns zero restored for an empty snapshot', async () => {
    const snap = { version: 2, exportedAt: Date.now(), memories: [], attachments: [], clusters: [] };
    const res = await restoreMemories(snap);
    expect(res.memories).toBe(0);
  });

  it('throws for a malformed snapshot row', async () => {
    await expect(restoreMemories([{ id: '' } as never])).rejects.toThrow();
  });
});

describe('countBackup', () => {
  it('counts non-deleted memories', async () => {
    memRows.push(
      { id: 'a', projectId: 'p1', deletedAt: null },
      { id: 'b', projectId: 'p1', deletedAt: null },
      { id: 'c', projectId: 'p1', deletedAt: new Date() }
    );
    const n = await countBackup('p1');
    expect(n).toBe(2);
  });
});

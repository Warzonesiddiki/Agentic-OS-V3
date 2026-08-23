/**
 * memory-storage.test.ts — unit tests for services/memory-cold-storage.ts
 * (cold-tier migration accounting, tiered recall, archive/restore wrappers).
 * DB access is intercepted via the standard db/client mock; no native bindings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state, dbMock, txMock, withTransactionMock, memoriesTable, memoryArchiveTable } =
  vi.hoisted(() => {
    const state = {
      // Rows returned for `memories` selects (candidates + hot tier).
      rows: [] as Array<Record<string, unknown>>,
      // Rows returned for `memory_archive` selects (cold tier).
      coldRows: [] as Array<Record<string, unknown>>,
      // originalId whose archive insert should reject (error-path fixture).
      failInsertFor: null as string | null,
      archived: [] as Array<Record<string, unknown>>,
      deletedIds: [] as string[],
      updates: [] as Array<Record<string, unknown>>,
      legacyInserts: [] as Array<Record<string, unknown>>,
    };

    const memoriesTable = { __table: 'memories' };
    const memoryArchiveTable = { __table: 'memory_archive' };

    const txMock: any = {
      insert: vi.fn(() => ({
        values: vi.fn(async (v: Record<string, unknown>) => {
          if (state.failInsertFor && v.originalId === state.failInsertFor) {
            throw new Error('archive-insert-failed');
          }
          state.archived.push(v);
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    };

    const dbMock: any = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () =>
              table === memoryArchiveTable ? [...state.coldRows] : [...state.rows]
            ),
          })),
        })),
      })),
    };

    const withTransactionMock = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(txMock));

    return { state, dbMock, txMock, withTransactionMock, memoriesTable, memoryArchiveTable };
  });

vi.mock('../src/db/client.js', () => ({
  db: dbMock,
  withTransaction: withTransactionMock,
  memories: memoriesTable,
  memoryArchive: memoryArchiveTable,
}));

import {
  runColdStorageMigration,
  recallWithColdStorage,
  archiveMemory,
  restoreMemory,
  isColdStored,
} from '../src/services/memory-cold-storage.js';

describe('memory-cold-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
    state.coldRows = [];
    state.failInsertFor = null;
    state.archived = [];
    state.deletedIds = [];
    state.updates = [];
    state.legacyInserts = [];
    // Legacy (Phase 12) mutation-chain stubs used by archiveMemory/restoreMemory.
    dbMock.update = vi.fn(() => ({
      set: vi.fn((v: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          state.updates.push(v);
        }),
      })),
    }));
    dbMock.insert = vi.fn(() => ({
      values: vi.fn(async (v: Record<string, unknown>) => {
        state.legacyInserts.push(v);
      }),
    }));
    // Capture deleted ids through the tx delete chain.
    txMock.delete.mockImplementation(() => ({
      where: vi.fn(async (condition: { where?: unknown } & unknown) => undefined),
    }));
  });

  describe('isColdStored', () => {
    it('returns true when coldStorageAt is set', () => {
      expect(isColdStored({ coldStorageAt: '2026-01-01T00:00:00Z' })).toBe(true);
    });

    it('returns false for null or missing coldStorageAt', () => {
      expect(isColdStored({ coldStorageAt: null })).toBe(false);
      expect(isColdStored({})).toBe(false);
    });
  });

  describe('archiveMemory', () => {
    it('rejects an empty location without touching the db', async () => {
      await expect(archiveMemory('mem_1', '')).rejects.toThrow();
      expect(dbMock.update).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('stamps cold-storage metadata and records the archive location', async () => {
      await archiveMemory('mem_42', 'cold://vault-a');
      expect(state.updates).toHaveLength(1);
      expect(state.updates[0]).toMatchObject({ archiveLocation: 'cold://vault-a' });
      expect(state.updates[0]?.coldStorageAt).toBeTruthy();
      expect(state.legacyInserts).toEqual([{ memoryId: 'mem_42', location: 'cold://vault-a' }]);
    });
  });

  describe('restoreMemory', () => {
    it('clears cold-storage markers', async () => {
      await restoreMemory('mem_7');
      expect(dbMock.update).toHaveBeenCalledTimes(1);
      expect(state.updates[0]).toMatchObject({ coldStorageAt: null, archiveLocation: null });
      expect(state.updates[0]?.archivedAt).toBeInstanceOf(Date);
    });
  });

  describe('runColdStorageMigration', () => {
    it('moves stale low-importance memories into the archive inside one transaction', async () => {
      state.rows = [
        { id: 'm1', kind: 'note', title: 'a', content: 'x', tags: [], importance: 0.05, source: 'api', projectId: null, tokenCost: 3 },
        { id: 'm2', kind: 'note', title: 'b', content: 'y', tags: [], importance: 0.02, source: 'api', projectId: 'p1', tokenCost: 4 },
      ];

      const report = await runColdStorageMigration();

      expect(withTransactionMock).toHaveBeenCalledTimes(1);
      expect(report.scanned).toBe(2);
      expect(report.moved).toBe(2);
      expect(report.errors).toBe(0);
      expect(report.threshold).toBe(0.1);
      expect(report.ageDays).toBe(90);
      expect(state.archived).toHaveLength(2);
      for (const row of state.archived) {
        expect(String(row.id)).toMatch(/^arc_/);
        expect(row.reason).toBe('cold-storage');
      }
      expect(txMock.delete).toHaveBeenCalledTimes(2);
    });

    it('counts per-candidate insert failures without aborting the batch', async () => {
      state.rows = [
        { id: 'ok1', kind: 'note', title: 'a', content: 'x', tags: [], importance: 0.01, source: 'api', projectId: null, tokenCost: 1 },
        { id: 'bad', kind: 'note', title: 'b', content: 'y', tags: [], importance: 0.01, source: 'api', projectId: null, tokenCost: 1 },
      ];
      state.failInsertFor = 'bad';

      const report = await runColdStorageMigration({ batchSize: 10 });

      expect(report.scanned).toBe(2);
      expect(report.moved).toBe(1);
      expect(report.errors).toBe(1);
    });

    it('honors explicit threshold and ageDays options in the report', async () => {
      const report = await runColdStorageMigration({ importanceThreshold: 0.25, ageDays: 30 });
      expect(report.threshold).toBe(0.25);
      expect(report.ageDays).toBe(30);
      expect(report.moved).toBe(0);
    });
  });

  describe('recallWithColdStorage', () => {
    it('returns hot matches only when includeCold is omitted', async () => {
      state.rows = [{ id: 'h1', kind: 'note', title: 'kubernetes', content: 'cluster notes' }];

      const res = await recallWithColdStorage('kube');

      expect(res.hot).toHaveLength(1);
      expect(res.hot[0]).toMatchObject({ id: 'h1', tier: 'hot' });
      expect(res.cold).toEqual([]);
    });

    it('includes cold-tier matches with tier=cold when requested', async () => {
      state.rows = [{ id: 'h1', kind: 'note', title: 'kubernetes', content: 'cluster notes' }];
      state.coldRows = [
        { id: 'c1', kind: 'note', title: 'old kubernetes runbook', content: 'archived' },
      ];

      const res = await recallWithColdStorage('kubernetes', true);

      expect(res.hot).toHaveLength(1);
      expect(res.cold).toHaveLength(1);
      expect(res.cold[0]).toMatchObject({ id: 'c1', tier: 'cold' });
    });
  });
});

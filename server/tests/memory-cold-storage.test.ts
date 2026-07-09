/**
 * Tests for server/src/services/memory-cold-storage.ts
 *
 * Cold-storage lifecycle (archive + restore). DB is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];
const archiveLog: Array<Record<string, unknown>> = [];
const coldRows: Array<Record<string, unknown>> = [];

const db = {
  update: () => ({
    set: (patch: Record<string, unknown>) => ({
      where: (cond: { id?: string }) => {
        updated.push({ id: cond?.id ?? 'x', patch });
        return Promise.resolve(undefined);
      },
    }),
  }),
  insert: () => ({
    values: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      archiveLog.push(...arr);
      return Promise.resolve(undefined);
    },
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(coldRows),
      }),
    }),
  }),
};

vi.mock('../src/db/client.js', () => ({
  db,
  memories: { id: 'id', coldStorageAt: 'coldStorageAt', archivedAt: 'archivedAt', archiveLocation: 'archiveLocation' },
  memoryArchive: {},
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

import { archiveMemory, restoreMemory, isColdStored } from '../src/services/memory-cold-storage.js';

beforeEach(() => {
  updated.length = 0;
  archiveLog.length = 0;
  coldRows.length = 0;
});

describe('archiveMemory', () => {
  it('marks the memory as cold-stored with a location', async () => {
    await archiveMemory('m1', 's3://bucket/key');
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('m1');
    expect(updated[0].patch.archiveLocation).toBe('s3://bucket/key');
    expect(updated[0].patch.coldStorageAt).toBeDefined();
  });
  it('records an archive audit row', async () => {
    await archiveMemory('m2', 's3://x');
    expect(archiveLog).toHaveLength(1);
    expect(archiveLog[0].memoryId).toBe('m2');
  });
  it('rejects an empty location', async () => {
    await expect(archiveMemory('m3', '')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('restoreMemory', () => {
  it('clears cold-storage markers on restore', async () => {
    await restoreMemory('m1');
    expect(updated[0].id).toBe('m1');
    expect(updated[0].patch.coldStorageAt).toBeNull();
    expect(updated[0].patch.archiveLocation).toBeNull();
    expect(updated[0].patch.archivedAt).toBeDefined();
  });
});

describe('isColdStored', () => {
  it('returns true when coldStorageAt is set', () => {
    expect(isColdStored({ coldStorageAt: new Date().toISOString() } as never)).toBe(true);
  });
  it('returns false when coldStorageAt is null', () => {
    expect(isColdStored({ coldStorageAt: null } as never)).toBe(false);
  });
});

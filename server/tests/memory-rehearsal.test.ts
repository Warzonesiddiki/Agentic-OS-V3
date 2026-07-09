/**
 * Tests for server/src/services/memory-rehearsal.ts
 *
 * Spaced-repetition scheduler. DB is mocked so we exercise select/insert/update
 * without Postgres/SQLite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Mem = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
  lastRehearsedAt: string | null;
  rehearsalCount: number;
  nextRehearsalAt: string | null;
  memoryType: string;
};

const memRows: Mem[] = [];
const inserted: Array<Record<string, unknown>> = [];
const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];

vi.mock('../src/db/client.js', () => {
  const qb = (rows: unknown[]) => Promise.resolve(rows);
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => qb(memRows),
            }),
          }),
        }),
      }),
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve(undefined);
        },
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (cond: unknown) => {
            const id = (cond as { id?: string })?.id ?? 'x';
            updated.push({ id, patch });
            return Promise.resolve(undefined);
          },
        }),
      }),
    },
    memories: { id: 'id', projectId: 'projectId', importance: 'importance', createdAt: 'createdAt', title: 'title', content: 'content', memoryType: 'memoryType' },
    isSqlite: true,
  };
});

vi.mock('../lib/logging.js', () => ({ log: { debug: () => undefined, error: () => undefined } }));

import {
  scheduleRehearsal,
  recordRehearsal,
  selectBatchForRehearsal,
  type RehearsalRecord,
} from '../src/services/memory-rehearsal.js';

beforeEach(() => {
  memRows.length = 0;
  inserted.length = 0;
  updated.length = 0;
});

function baseMem(over: Partial<Mem> = {}): Mem {
  const now = new Date();
  return {
    id: 'm1',
    projectId: 'p1',
    title: 't',
    content: 'c',
    importance: 0.5,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastRehearsedAt: null,
    rehearsalCount: 0,
    nextRehearsalAt: null,
    memoryType: 'episodic',
    ...over,
  };
}

describe('scheduleRehearsal', () => {
  it('inserts a rehearsal schedule row with a next-due date', async () => {
    await scheduleRehearsal('m1', { intervalDays: 3 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].memoryId).toBe('m1');
    expect(typeof inserted[0].nextRehearsalAt).toBe('string');
  });

  it('defaults intervalDays to 1', async () => {
    await scheduleRehearsal('m2');
    const rec = inserted[0];
    const due = new Date(rec.nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(0.9);
    expect(diffDays).toBeLessThan(1.1);
  });

  it('supports a custom interval', async () => {
    await scheduleRehearsal('m3', { intervalDays: 7 });
    const due = new Date(inserted[0].nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(6.9);
  });
});

describe('recordRehearsal', () => {
  it('increments the rehearsal count and reschedules', async () => {
    await recordRehearsal('m1', { quality: 4 });
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('m1');
    const patch = updated[0].patch;
    expect(patch.rehearsalCount).toBe(1);
    expect(patch.lastRehearsedAt).toBeDefined();
  });

  it('escalates the interval for high-quality recall', async () => {
    await recordRehearsal('m2', { quality: 5 });
    const due = new Date(updated[0].patch.nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(1); // interval grows beyond base
  });

  it('shrinks the interval for low-quality recall', async () => {
    await recordRehearsal('m3', { quality: 1 });
    const due = new Date(updated[0].patch.nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(0);
  });
});

describe('selectBatchForRehearsal', () => {
  it('returns due memories from the mock store', async () => {
    memRows.push(
      baseMem({ id: 'a', nextRehearsalAt: new Date(Date.now() - 1000).toISOString() }),
      baseMem({ id: 'b', nextRehearsalAt: new Date(Date.now() + 9999_999_999).toISOString() })
    );
    const batch = await selectBatchForRehearsal();
    expect(batch.map((m) => (m as unknown as Mem).id)).toEqual(['a']);
  });

  it('respects the limit option', async () => {
    memRows.push(
      baseMem({ id: 'a', nextRehearsalAt: new Date(Date.now() - 1000).toISOString() }),
      baseMem({ id: 'c', nextRehearsalAt: new Date(Date.now() - 2000).toISOString() })
    );
    const batch = await selectBatchForRehearsal({ limit: 1 });
    expect(batch).toHaveLength(1);
  });

  it('returns an empty batch when nothing is due', async () => {
    memRows.push(baseMem({ id: 'z', nextRehearsalAt: new Date(Date.now() + 9999_999_999).toISOString() }));
    const batch = await selectBatchForRehearsal();
    expect(batch).toHaveLength(0);
  });
});

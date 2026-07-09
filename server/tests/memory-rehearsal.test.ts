/**
 * Tests for server/src/services/memory-rehearsal.ts
 *
 * Spaced-repetition scheduler. `db.query.memories.findMany` + `db.update()`
 * are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memRows: Array<Record<string, unknown>> = [];
const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];

const db = {
  query: {
    memories: {
      findMany: () => Promise.resolve(memRows),
    },
  },
  update: () => ({
    set: (patch: Record<string, unknown>) => ({
      where: (cond: { id?: string }) => {
        updated.push({ id: cond?.id ?? 'x', patch });
        return Promise.resolve(undefined);
      },
    }),
  }),
};

vi.mock('../src/db/client.js', () => ({
  db,
  memories: { id: 'id', projectId: 'projectId', importance: 'importance', createdAt: 'createdAt', title: 'title', content: 'content', memoryType: 'memoryType' },
  isSqlite: true,
}));

vi.mock('../lib/logging.js', () => ({ log: { debug: () => undefined, error: () => undefined } }));

import { scheduleRehearsal, recordRehearsal, selectBatchForRehearsal } from '../src/services/memory-rehearsal.js';

beforeEach(() => {
  memRows.length = 0;
  updated.length = 0;
});

function baseMem(over: Record<string, unknown> = {}) {
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
  it('returns a schedule with a future due date', async () => {
    const s = await scheduleRehearsal('m1', { intervalDays: 3 });
    expect(s.memoryId).toBe('m1');
    expect(new Date(s.nextRehearsalAt).getTime()).toBeGreaterThan(Date.now());
  });
  it('defaults intervalDays to 1', async () => {
    const s = await scheduleRehearsal('m2');
    const diffDays = (new Date(s.nextRehearsalAt).getTime() - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(0.9);
    expect(diffDays).toBeLessThan(1.1);
  });
});

describe('recordRehearsal', () => {
  it('increments the rehearsal count and reschedules', async () => {
    await recordRehearsal('m1', { quality: 4 });
    expect(updated).toHaveLength(1);
    expect(updated[0].patch.rehearsalCount).toBe(1);
    expect(updated[0].patch.lastRehearsedAt).toBeDefined();
    expect(updated[0].patch.nextRehearsalAt).toBeDefined();
  });
  it('escalates the interval for high-quality recall', async () => {
    await recordRehearsal('m2', { quality: 5 });
    const due = new Date(updated[0].patch.nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(1);
  });
  it('shrinks the interval for low-quality recall', async () => {
    await recordRehearsal('m3', { quality: 1 });
    const due = new Date(updated[0].patch.nextRehearsalAt as string).getTime();
    const diffDays = (due - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(0);
  });
});

describe('selectBatchForRehearsal', () => {
  it('returns due memories', async () => {
    memRows.push(
      baseMem({ id: 'a', nextRehearsalAt: new Date(Date.now() - 1000).toISOString() }),
      baseMem({ id: 'b', nextRehearsalAt: new Date(Date.now() + 9_999_999_999).toISOString() })
    );
    const batch = await selectBatchForRehearsal();
    expect(batch.map((m) => m.id)).toEqual(['a']);
  });
  it('respects the limit option', async () => {
    memRows.push(
      baseMem({ id: 'a', nextRehearsalAt: new Date(Date.now() - 1000).toISOString() }),
      baseMem({ id: 'c', nextRehearsalAt: new Date(Date.now() - 2000).toISOString() })
    );
    const batch = await selectBatchForRehearsal({ limit: 1 });
    expect(batch).toHaveLength(1);
  });
  it('returns empty when nothing is due', async () => {
    memRows.push(baseMem({ id: 'z', nextRehearsalAt: new Date(Date.now() + 9_999_999_999).toISOString() }));
    const batch = await selectBatchForRehearsal();
    expect(batch).toHaveLength(0);
  });
});

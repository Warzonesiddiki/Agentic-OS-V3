/**
 * Tests for server/src/services/memory-trainer.ts
 *
 * Phase 12.10 feedback-weighted ranking trainer. Pure deterministic logic for
 * `trainRanker` + `applyWeights` (no DB). `recordFeedback` / `trainFromStore`
 * are DB-backed and exercised via a mocked db client.
 */
import { describe, it, expect, vi } from 'vitest';

const inserted: Array<Record<string, unknown>> = [];
const selectRows: Array<Record<string, unknown>> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve(undefined);
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(selectRows),
          }),
        }),
      }),
    }),
  },
  feedback: { id: 'id', projectId: 'projectId', itemId: 'itemId', itemType: 'itemType', helpful: 'helpful' },
  isSqlite: true,
}));

vi.mock('../src/lib/logging.js', () => ({
  log: { error: () => undefined, info: () => undefined, warn: () => undefined },
}));

import {
  trainRanker,
  applyWeights,
  recordFeedback,
  trainFromStore,
  type RankWeights,
  type TrainingSample,
} from '../src/services/memory-trainer.js';

describe('trainRanker', () => {
  it('returns empty/zero weights when there are no samples', () => {
    const w = trainRanker([]);
    expect(w.byKind).toEqual({});
    expect(w.byTag).toEqual({});
    expect(w.global).toBe(0);
  });

  it('computes a positive global bias when most feedback is helpful', () => {
    const samples: TrainingSample[] = [
      { itemId: 'a', itemType: 'episodic', helpful: true },
      { itemId: 'b', itemType: 'episodic', helpful: true },
      { itemId: 'c', itemType: 'semantic', helpful: true },
      { itemId: 'd', itemType: 'semantic', helpful: false },
    ];
    const w = trainRanker(samples);
    expect(w.global).toBeCloseTo(0.5, 10); // (3 positive - 1 negative) / 4
  });

  it('computes a negative global bias when most feedback is unhelpful', () => {
    const samples: TrainingSample[] = [
      { itemId: 'a', itemType: 'episodic', helpful: false },
      { itemId: 'b', itemType: 'episodic', helpful: false },
      { itemId: 'c', itemType: 'semantic', helpful: false },
      { itemId: 'd', itemType: 'semantic', helpful: true },
    ];
    const w = trainRanker(samples);
    expect(w.global).toBeCloseTo(-0.5, 10);
  });

  it('builds per-kind weight buckets from helpfulness', () => {
    const samples: TrainingSample[] = [
      { itemId: 'a', itemType: 'episodic', helpful: true },
      { itemId: 'b', itemType: 'episodic', helpful: true },
      { itemId: 'c', itemType: 'episodic', helpful: false },
    ];
    const w = trainRanker(samples);
    // episodic: +1, +1, -1 = +1 over total 3 -> normalized to +1/3
    expect(w.byKind['episodic']).toBeCloseTo(1 / 3, 10);
  });

  it('clamps kind weights to [-1, 1]', () => {
    const samples: TrainingSample[] = [];
    for (let i = 0; i < 10; i++) samples.push({ itemId: 'x' + i, itemType: 'k', helpful: true });
    const w = trainRanker(samples);
    expect(w.byKind['k']).toBeLessThanOrEqual(1);
    expect(w.byKind['k']).toBeGreaterThanOrEqual(-1);
  });

  it('creates a parallel byTag bucket derived from itemType', () => {
    const samples: TrainingSample[] = [
      { itemId: 'a', itemType: 'episodic', helpful: true },
      { itemId: 'b', itemType: 'episodic', helpful: false },
    ];
    const w = trainRanker(samples);
    expect(w.byTag['t:episodic']).toBeDefined();
    expect(w.byTag['t:episodic']).toBeCloseTo(0, 10); // +1 -1 = 0
  });
});

describe('applyWeights', () => {
  it('increases a base score when kind weight is positive', () => {
    const w: RankWeights = {
      byKind: { episodic: 0.5 },
      byTag: {},
      global: 0,
    };
    const base = 0.5;
    const applied = applyWeights(base, 'episodic', w);
    expect(applied).toBeGreaterThan(base);
  });

  it('decreases a base score when kind weight is negative', () => {
    const w: RankWeights = {
      byKind: { episodic: -0.5 },
      byTag: {},
      global: 0,
    };
    const applied = applyWeights(0.5, 'episodic', w);
    expect(applied).toBeLessThan(0.5);
  });

  it('uses global bias when kind weight is absent', () => {
    const w: RankWeights = { byKind: {}, byTag: {}, global: 0.4 };
    const applied = applyWeights(0.5, 'unknown-kind', w);
    expect(applied).toBeGreaterThan(0.5);
  });

  it('clamps the result into a sane range', () => {
    const w: RankWeights = { byKind: { k: 1 }, byTag: {}, global: 1 };
    const applied = applyWeights(1, 'k', w);
    expect(applied).toBeLessThanOrEqual(1);
    expect(applied).toBeGreaterThanOrEqual(0);
  });

  it('treats missing kind weight as zero contribution from kind', () => {
    const w: RankWeights = { byKind: {}, byTag: {}, global: 0 };
    expect(applyWeights(0.4, 'x', w)).toBeCloseTo(0.4, 10);
  });
});

describe('recordFeedback', () => {
  it('inserts a feedback row with generated id and timestamp', async () => {
    inserted.length = 0;
    await recordFeedback('p1', 'item-1', 'episodic', true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].projectId).toBe('p1');
    expect(inserted[0].itemId).toBe('item-1');
    expect(inserted[0].itemType).toBe('episodic');
    expect(inserted[0].helpful).toBe(true);
    expect(typeof inserted[0].id).toBe('string');
    expect(inserted[0].createdAt instanceof Date).toBe(true);
  });
});

describe('trainFromStore', () => {
  it('returns zero weights when the store is empty', async () => {
    selectRows.length = 0;
    const w = await trainFromStore('p1');
    expect(w.global).toBe(0);
    expect(w.byKind).toEqual({});
  });

  it('trains from persisted feedback rows', async () => {
    selectRows.length = 0;
    selectRows.push(
      { itemId: 'a', itemType: 'episodic', helpful: true },
      { itemId: 'b', itemType: 'semantic', helpful: false }
    );
    const w = await trainFromStore('p1');
    expect(w.global).toBeCloseTo(0, 10); // +1 -1
    expect(w.byKind['episodic']).toBeCloseTo(0.5, 10); // +1 over 2 samples
    expect(w.byKind['semantic']).toBeCloseTo(-0.5, 10); // -1 over 2 samples
  });

  it('maps rows preserving the helpful flag', async () => {
    selectRows.length = 0;
    selectRows.push({ itemId: 'z', itemType: 'procedural', helpful: false });
    const w = await trainFromStore('p2');
    expect(w.byKind['procedural']).toBeCloseTo(-1, 10);
  });
});

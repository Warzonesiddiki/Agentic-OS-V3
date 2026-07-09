/**
 * Tests for server/src/services/memory-decay.ts
 *
 * Covers the half-life decay math (computeDecayedImportance), the per-kind
 * half-life lookup (halflifeForKind / HALFLIFE_HOURS), and the batch
 * decayImportance job (DB-backed, exercised with a mocked db client).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRows: Array<{
  id: string;
  importance: number;
  createdAt: Date;
  kind: string;
  decayHalflifeHours?: number;
  projectId?: string;
}> = [];
const updates: Array<{ id: string; importance: number }> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    query: {
      memories: {
        findMany: () => Promise.resolve(queryRows),
      },
    },
    update: () => ({
      set: (patch: { importance: number }) => ({
        where: (cond: unknown) => {
          // capture the id via the eq condition isn't trivial; instead we
          // rely on the loop order — record the importance update per call.
          updates.push({ id: 'captured', importance: patch.importance });
          return Promise.resolve(undefined);
        },
      }),
    }),
  },
  memories: { id: 'id', projectId: 'projectId', importance: 'importance', createdAt: 'createdAt', kind: 'kind' },
  isSqlite: true,
}));

import {
  computeDecayedImportance,
  halflifeForKind,
  HALFLIFE_HOURS,
  decayImportance,
} from '../src/services/memory-decay.js';

beforeEach(() => {
  queryRows.length = 0;
  updates.length = 0;
});

describe('computeDecayedImportance', () => {
  it('returns importance unchanged when deltaHours is zero', () => {
    expect(computeDecayedImportance(0.8, 0, 30)).toBeCloseTo(0.8, 10);
  });

  it('decays by e^-1 after exactly one half-life window (continuous exp)', () => {
    // decayed = importance * exp(-deltaHours / halflife); at delta==halflife => exp(-1)
    expect(computeDecayedImportance(1, 30, 30)).toBeCloseTo(Math.exp(-1), 10);
    expect(computeDecayedImportance(1, 12, 12)).toBeCloseTo(Math.exp(-1), 10);
  });

  it('decays to e^-2 after two half-life windows', () => {
    expect(computeDecayedImportance(1, 60, 30)).toBeCloseTo(Math.exp(-2), 10);
  });

  it('respects a custom halflifeHours', () => {
    expect(computeDecayedImportance(1, 10, 10)).toBeCloseTo(Math.exp(-1), 10);
  });

  it('never drops below zero', () => {
    expect(computeDecayedImportance(1, 1e9, 30)).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds one', () => {
    expect(computeDecayedImportance(2, 0, 30)).toBeLessThanOrEqual(1);
  });

  it('is monotonic decreasing in age', () => {
    const young = computeDecayedImportance(1, 10, 30);
    const old = computeDecayedImportance(1, 90, 30);
    expect(young).toBeGreaterThan(old);
  });

  it('scales linearly with initial importance', () => {
    expect(computeDecayedImportance(0.5, 30, 30)).toBeCloseTo(0.5 * Math.exp(-1), 10);
  });

  it('long half-life barely decays short-lived memories', () => {
    expect(computeDecayedImportance(1, 12, 720)).toBeGreaterThan(0.98);
  });

  it('never drops below zero', () => {
    expect(computeDecayedImportance(1, 1e9, 30)).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds one', () => {
    expect(computeDecayedImportance(2, 0, 30)).toBeLessThanOrEqual(1);
  });

  it('guards against zero/negative halflife denominators', () => {
    expect(computeDecayedImportance(1, 10, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('halflifeForKind', () => {
  it('returns the configured per-kind half-life', () => {
    expect(HALFLIFE_HOURS.episodic).toBe(12);
    expect(HALFLIFE_HOURS.semantic).toBe(168);
    expect(HALFLIFE_HOURS.preference).toBe(168);
    expect(HALFLIFE_HOURS.reflexion).toBe(168);
    expect(HALFLIFE_HOURS.fact).toBe(720);
  });

  it('falls back to 168h for unknown kinds', () => {
    expect(halflifeForKind('mystery')).toBe(168);
  });

  it('matches computeDecayedImportance for a known kind', () => {
    const hl = halflifeForKind('episodic');
    expect(computeDecayedImportance(1, hl, hl)).toBeCloseTo(Math.exp(-1), 10);
  });
});

describe('decayImportance (batch job)', () => {
  it('updates memories whose decayed importance changed', async () => {
    queryRows.push({
      id: 'm1',
      importance: 1,
      kind: 'episodic',
      createdAt: new Date(Date.now() - 1000 * 3600_000), // 1000h ago -> decayed
      projectId: 'p1',
    });
    const res = await decayImportance({ projectId: 'p1' });
    expect(res.updated).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].importance).toBeLessThan(1);
  });

  it('skips memories whose importance is unchanged by decay', async () => {
    // a negative delta (createdAt in the future) -> exp(positive) >1 -> clamped
    // to 1, which equals the source importance of 1 -> no update.
    queryRows.push({
      id: 'm2',
      importance: 1,
      kind: 'fact',
      createdAt: new Date(Date.now() + 1_000_000),
      projectId: 'p1',
    });
    const res = await decayImportance({ projectId: 'p1' });
    expect(res.updated).toBe(0);
  });

  it('uses an explicit decayHalflifeHours override when present', async () => {
    queryRows.push({
      id: 'm3',
      importance: 1,
      kind: 'episodic',
      decayHalflifeHours: 1,
      createdAt: new Date(Date.now() - 10 * 3600_000), // 10h at 1h half-life -> tiny
      projectId: 'p1',
    });
    const res = await decayImportance();
    expect(res.updated).toBe(1);
    expect(updates[0].importance).toBeLessThan(0.01);
  });

  it('respects the limit option without error', async () => {
    queryRows.push({
      id: 'm4',
      importance: 1,
      kind: 'semantic',
      createdAt: new Date(Date.now() - 9999 * 3600_000),
      projectId: 'p1',
    });
    const res = await decayImportance({ limit: 5 });
    expect(res.updated).toBe(1);
  });
});

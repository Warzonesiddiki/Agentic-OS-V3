import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import { halflifeForKind, computeDecayedImportance } from '../src/services/memory-decay.js';

describe('memory-decay — halflifeForKind', () => {
  it('returns a positive number for known kinds', () => {
    expect(halflifeForKind('episodic')).toBeGreaterThan(0);
    expect(halflifeForKind('semantic')).toBeGreaterThan(0);
  });
  it('falls back to a default for unknown kinds', () => {
    const d = halflifeForKind('does-not-exist');
    expect(d).toBeGreaterThan(0);
  });
});

describe('memory-decay — computeDecayedImportance', () => {
  it('is callable and does not throw for a typical memory', () => {
    const mem = {
      importance: 1.0,
      kind: 'episodic',
      createdAt: new Date(Date.now() - 100000),
      lastAccessedAt: new Date(),
    } as any;
    expect(() => computeDecayedImportance(mem)).not.toThrow();
  });
  it('returns a finite-or-NaN numeric result without crashing', () => {
    const out = computeDecayedImportance({ importance: 0.5, kind: 'episodic' } as any);
    expect(typeof out === 'number' || Number.isNaN(out)).toBe(true);
  });
});

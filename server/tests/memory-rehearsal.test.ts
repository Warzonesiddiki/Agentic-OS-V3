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

import { nextRehearsalInterval, boostForRehearsal } from '../src/services/memory-rehearsal.js';

describe('memory-rehearsal — nextRehearsalInterval', () => {
  it('returns increasing intervals with more rehearsals', () => {
    const i0 = nextRehearsalInterval(0);
    const i1 = nextRehearsalInterval(1);
    const i3 = nextRehearsalInterval(3);
    expect(i1).toBeGreaterThan(i0);
    expect(i3).toBeGreaterThanOrEqual(i1);
  });
  it('returns a positive number', () => {
    expect(nextRehearsalInterval(0)).toBeGreaterThan(0);
  });
});

describe('memory-rehearsal — boostForRehearsal', () => {
  it('returns a positive boost', () => {
    expect(boostForRehearsal(0)).toBeGreaterThan(0);
  });
  it('is non-negative and grows with rehearsal count', () => {
    const b0 = boostForRehearsal(0);
    const b5 = boostForRehearsal(5);
    expect(b0).toBeGreaterThanOrEqual(0);
    expect(b5).toBeGreaterThanOrEqual(0);
    expect(b5).toBeGreaterThanOrEqual(b0);
  });
});

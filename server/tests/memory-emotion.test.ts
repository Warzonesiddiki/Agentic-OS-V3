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

import { normalizeEmotionVector, EMOTIONS } from '../src/services/memory-emotion.js';

describe('memory-emotion — EMOTIONS', () => {
  it('is a non-empty list of emotion names', () => {
    expect(Array.isArray(EMOTIONS)).toBe(true);
    expect(EMOTIONS.length).toBeGreaterThan(0);
  });
});

describe('memory-emotion — normalizeEmotionVector', () => {
  it('returns a vector keyed by each known emotion', () => {
    const v = normalizeEmotionVector({ joy: 1, anger: 0.5 });
    for (const e of EMOTIONS) {
      expect(typeof v[e as keyof typeof v]).toBe('number');
    }
  });
  it('clamps or floors unknown/negative inputs to valid numbers', () => {
    const v = normalizeEmotionVector({ joy: -5, nonsense: 'x' } as any);
    expect(v.joy).toBeGreaterThanOrEqual(0);
  });
  it('is deterministic', () => {
    const a = normalizeEmotionVector({ joy: 0.3 });
    const b = normalizeEmotionVector({ joy: 0.3 });
    expect(a).toEqual(b);
  });
});

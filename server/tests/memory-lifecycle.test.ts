import { describe, it, expect } from 'vitest';
import { computeDecayedImportance, halflifeForKind } from '../src/services/memory-decay.js';
import { nextRehearsalInterval, boostForRehearsal } from '../src/services/memory-rehearsal.js';
import { cosineSimilarity, previewMerge } from '../src/services/memory-dedup.js';
import type { MemoryLike } from '../src/services/memory-dedup.js';

describe('memory decay', () => {
  it('uses per-kind halflife', () => {
    expect(halflifeForKind('episodic')).toBe(12);
    expect(halflifeForKind('semantic')).toBe(168);
  });

  it('decays importance below 0.3 after 24h (episodic, halflife 12h)', () => {
    const after = computeDecayedImportance(1, 24, 12);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(0.3);
  });

  it('leaves importance unchanged with no elapsed time and clamps to 0', () => {
    expect(computeDecayedImportance(0.5, 0, 100)).toBe(0.5);
    expect(computeDecayedImportance(1, 1e9, 12)).toBe(0);
  });
});

describe('memory rehearsal', () => {
  it('advances intervals 1->3->7->30 and caps', () => {
    expect(nextRehearsalInterval(0)).toBe(1);
    expect(nextRehearsalInterval(1)).toBe(3);
    expect(nextRehearsalInterval(2)).toBe(7);
    expect(nextRehearsalInterval(3)).toBe(30);
    expect(nextRehearsalInterval(4)).toBe(30);
  });

  it('boost is positive, increases with rehearsal, capped at 0.15', () => {
    expect(boostForRehearsal(0)).toBeGreaterThan(0);
    expect(boostForRehearsal(5)).toBeGreaterThan(boostForRehearsal(0));
    expect(boostForRehearsal(100)).toBeLessThanOrEqual(0.15);
  });
});

describe('memory dedup', () => {
  it('cosine similarity is 1 for identical and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it('merges higher-importance memory as kept with summed recall and concatenated content', () => {
    const a: MemoryLike = {
      id: 'a',
      title: 'A',
      content: 'alpha',
      importance: 0.9,
      recallCount: 2,
      tags: ['x'],
    };
    const b: MemoryLike = {
      id: 'b',
      title: 'B',
      content: 'beta',
      importance: 0.4,
      recallCount: 3,
      tags: ['y'],
    };
    const m = previewMerge(a, b);
    expect(m.keptId).toBe('a');
    expect(m.droppedId).toBe('b');
    expect(m.recallCount).toBe(5);
    expect(m.importance).toBe(0.9);
    expect(m.content).toContain('alpha');
    expect(m.content).toContain('beta');
    expect(m.tags).toEqual(['x', 'y']);
  });
});

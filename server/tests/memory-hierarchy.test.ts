/**
 * Tests for server/src/services/memory-hierarchy.ts
 *
 * Pure helpers for embeddings/vectors (cosineSimilarity, toVector, tagsOf).
 */
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, toVector, tagsOf, type Memory } from '../src/services/memory-hierarchy.js';

function mem(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'm1',
    kind: 'fact',
    importance: 0.5,
    projectId: 'p1',
    createdAt: new Date(),
    ...overrides,
  } as Memory;
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });
  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
  it('returns 0 for a zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  it('compares only up to the min length', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBeCloseTo(1, 10);
  });
  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
  it('treats missing entries as zero', () => {
    expect(cosineSimilarity([1, , 3], [1, 0, 3])).toBeCloseTo(1, 10);
  });
  it('is symmetric', () => {
    expect(cosineSimilarity([1, 2], [2, -1])).toBeCloseTo(cosineSimilarity([2, -1], [1, 2]), 10);
  });
});

describe('toVector', () => {
  it('parses a JSON string embedding', () => {
    expect(toVector('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
  });
  it('returns a numeric array as-is', () => {
    expect(toVector([0.5, 0.5])).toEqual([0.5, 0.5]);
  });
  it('returns null for null', () => {
    expect(toVector(null)).toBeNull();
  });
  it('returns null for an invalid string', () => {
    expect(toVector('not json')).toBeNull();
  });
  it('returns null for a non-array JSON', () => {
    expect(toVector('{"a":1}')).toBeNull();
  });
  it('returns null for an unexpected type', () => {
    expect(toVector(42 as unknown)).toBeNull();
  });
});

describe('tagsOf', () => {
  it('returns an array tag list as-is', () => {
    expect(tagsOf(mem({ tags: ['a', 'b'] }))).toEqual(['a', 'b']);
  });
  it('parses a JSON string tag list', () => {
    expect(tagsOf(mem({ tags: '["x","y"]' }))).toEqual(['x', 'y']);
  });
  it('parses a comma-separated string', () => {
    expect(tagsOf(mem({ tags: 'x, y, z' }))).toEqual(['x', 'y', 'z']);
  });
  it('returns empty for null tags', () => {
    expect(tagsOf(mem({ tags: null }))).toEqual([]);
  });
  it('returns empty for an unexpected tag type', () => {
    expect(tagsOf(mem({ tags: 123 as unknown }))).toEqual([]);
  });
});

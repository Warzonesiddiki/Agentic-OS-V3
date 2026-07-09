import { describe, it, expect } from 'vitest';
import {
  coerceClassification,
  classifyByTags,
  type ContradictionClassification,
} from '../src/services/memory-contradiction.js';

describe('memory-contradiction / coerceClassification', () => {
  it('maps contradictory phrasing to "contradicting"', () => {
    expect(coerceClassification('contradicting')).toBe('contradicting');
    expect(coerceClassification('  CONTRADICTS ')).toBe('contradicting');
  });

  it('maps supporting/agreeing phrasing to "supporting"', () => {
    expect(coerceClassification('supporting')).toBe('supporting');
    expect(coerceClassification('agrees')).toBe('supporting');
    expect(coerceClassification('consistent')).toBe('supporting');
  });

  it('defaults unknown phrasing to "neutral"', () => {
    expect(coerceClassification('weird')).toBe('neutral');
    expect(coerceClassification('')).toBe('neutral');
  });

  it('accepts the full valid enum set', () => {
    const valid: ContradictionClassification[] = ['supporting', 'contradicting', 'neutral'];
    for (const v of valid) {
      expect(coerceClassification(v)).toBe(v);
    }
  });
});

describe('memory-contradiction / classifyByTags', () => {
  it('classifies supporting when tag overlap is strong (>= 50% of smaller set)', () => {
    expect(classifyByTags(['a', 'b', 'c'], ['a', 'b', 'x'])).toBe('supporting');
    expect(classifyByTags(['topic:ui'], ['topic:ui'])).toBe('supporting');
  });

  it('classifies neutral when overlap is weak', () => {
    expect(classifyByTags(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'z'])).toBe('neutral');
    expect(classifyByTags(['a'], ['b'])).toBe('neutral');
  });

  it('classifies neutral for empty inputs', () => {
    expect(classifyByTags([], ['a'])).toBe('neutral');
    expect(classifyByTags(['a'], [])).toBe('neutral');
    expect(classifyByTags([], [])).toBe('neutral');
  });

  it('is case-insensitive on tags', () => {
    expect(classifyByTags(['Topic:AI'], ['topic:ai'])).toBe('supporting');
  });

  it('is deterministic for identical inputs', () => {
    expect(classifyByTags(['a', 'b'], ['a', 'b'])).toEqual(classifyByTags(['b', 'a'], ['b', 'a']));
  });
});

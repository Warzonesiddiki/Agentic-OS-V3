import { describe, it, expect } from 'vitest';
import {
  coerceClassification,
  classifyByTags,
  type ContradictionClassification,
} from '../src/services/memory-contradiction.js';

describe('memory-contradiction / coerceClassification', () => {
  it('normalizes valid classifications exactly', () => {
    expect(coerceClassification('direct')).toBe('direct');
    expect(coerceClassification('supports')).toBe('supports');
    expect(coerceClassification('inconclusive')).toBe('inconclusive');
  });

  it('lower-cases, trims, and defaults unknown to inconclusive', () => {
    expect(coerceClassification('  DIRECT ')).toBe('direct');
    expect(coerceClassification('weird')).toBe('inconclusive');
    expect(coerceClassification('')).toBe('inconclusive');
  });

  it('accepts the full valid enum set', () => {
    const valid: ContradictionClassification[] = ['direct', 'indirect', 'supports', 'inconclusive'];
    for (const v of valid) {
      expect(coerceClassification(v)).toBe(v);
    }
  });
});

describe('memory-contradiction / classifyByTags', () => {
  it('classifies direct when both positive and negative sentiment tags are present', () => {
    const c = classifyByTags(['sentiment:+', 'sentiment:-', 'topic:weather']);
    expect(c.classification).toBe('direct');
    expect(c.confidence).toBeGreaterThan(0.5);
  });

  it('classifies supports when only positive tags appear', () => {
    const c = classifyByTags(['sentiment:+', 'topic:ui']);
    expect(c.classification).toBe('supports');
  });

  it('classifies supports when only negative tags appear', () => {
    const c = classifyByTags(['sentiment:-', 'topic:perf']);
    expect(c.classification).toBe('supports');
  });

  it('classifies inconclusive for empty / neutral tag sets', () => {
    expect(classifyByTags([]).classification).toBe('inconclusive');
    expect(classifyByTags(['topic:x', 'meta:y']).classification).toBe('inconclusive');
  });

  it('boosts precedence conflict to direct regardless of sentiment', () => {
    const c = classifyByTags(['precedence:conflict', 'topic:z']);
    expect(c.classification).toBe('direct');
  });

  it('is deterministic for the same input', () => {
    const a = classifyByTags(['sentiment:+', 'sentiment:-']);
    const b = classifyByTags(['sentiment:+', 'sentiment:-']);
    expect(a).toEqual(b);
  });
});

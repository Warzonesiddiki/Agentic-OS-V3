import { describe, it, expect } from 'vitest';
import { autocomplete } from '../src/services/memory-search-suggest.js';

describe('memory-search-suggest / autocomplete', () => {
  it('returns empty for blank prefix', () => {
    expect(autocomplete('  ', ['alpha', 'beta'], ['t1'])).toEqual([]);
  });

  it('suggests tags that start with the prefix, scored above history', () => {
    const sugs = autocomplete('a', ['alpha', 'beta'], ['animals']);
    // 'alpha' (tag) and 'animals' (tag) both match prefix
    const values = sugs.map((s) => s.value);
    expect(values).toContain('alpha');
    expect(values).toContain('animals');
    // tag matches get score 2, ranked first on ties
    expect(sugs[0]!.score).toBe(2);
  });

  it('suggests history entries containing the prefix', () => {
    const sugs = autocomplete('pay', [], [], 8);
    // no history provided here → empty; provide history
    const s2 = autocomplete('pay', ['payment gateway', 'something else'], []);
    expect(s2.map((s) => s.value)).toContain('payment gateway');
    expect(s2.every((s) => s.type === 'history')).toBe(true);
  });

  it('honors the limit', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    const sugs = autocomplete('tag-', [], tags, 5);
    expect(sugs).toHaveLength(5);
  });

  it('de-duplicates by value keeping the highest score', () => {
    // same string present as tag and as history prefix match
    const sugs = autocomplete('alpha', ['alpha'], ['alpha']);
    expect(sugs.filter((s) => s.value === 'alpha')).toHaveLength(1);
    expect(sugs[0]!.score).toBe(2); // tag score wins
  });

  it('orders by score desc then value', () => {
    const sugs = autocomplete('a', [], ['zebra-x', 'alpha-x']);
    // both history matches; alpha-x < zebra-x alphabetically
    expect(sugs[0]!.value).toBe('alpha-x');
  });
});

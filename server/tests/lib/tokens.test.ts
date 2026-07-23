/**
 * tokens.test.ts — Tests for token estimation, BM25 scoring, and budget packing.
 * Pure functions — no DB or I/O needed.
 */
import { describe, it, expect } from 'vitest';
import { estimateTokens, tokenize, bm25, packByBudget } from '../../src/lib/tokens.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(estimateTokens('   ')).toBe(0);
  });

  it('estimates ~1 token per 4 characters', () => {
    // 40 chars -> ~10 tokens
    const text = 'a'.repeat(40);
    expect(estimateTokens(text)).toBe(10);
  });

  it('returns at least 1 for non-empty text', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('hi')).toBe(1);
  });

  it('handles mixed content', () => {
    const text = 'Hello, world! This is a test.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 4));
  });
});

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    const tokens = tokenize('Hello, World!');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
  });

  it('removes stop words', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
  });

  it('removes single-character tokens', () => {
    const tokens = tokenize('I am a developer');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
    expect(tokens).toContain('am');
    expect(tokens).toContain('developer');
  });

  it('returns empty for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles numbers', () => {
    const tokens = tokenize('version 20 release');
    expect(tokens).toContain('version');
    expect(tokens).toContain('20');
    expect(tokens).toContain('release');
  });
});

describe('bm25', () => {
  const docs = [
    { id: '1', text: 'The quick brown fox jumps over the lazy dog' },
    { id: '2', text: 'A fast red fox runs through the forest' },
    { id: '3', text: 'TypeScript is a typed superset of JavaScript' },
    { id: '4', text: 'Rust provides memory safety without garbage collection' },
  ];

  it('returns results sorted by score descending', () => {
    const results = bm25(docs, 'fox');
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('scores documents containing query terms higher', () => {
    const results = bm25(docs, 'fox');
    // Documents 1 and 2 contain 'fox', doc 3 and 4 don't
    const foxDocs = results.filter((r) => r.id === '1' || r.id === '2');
    expect(foxDocs.length).toBe(2);
    expect(foxDocs[0]!.score).toBeGreaterThan(0);
  });

  it('returns empty for empty query', () => {
    expect(bm25(docs, '')).toEqual([]);
  });

  it('returns empty for empty corpus', () => {
    expect(bm25([], 'fox')).toEqual([]);
  });

  it('returns empty when no documents match', () => {
    const results = bm25(docs, 'xyznonexistent');
    expect(results).toEqual([]);
  });

  it('handles multi-term queries', () => {
    const results = bm25(docs, 'quick brown');
    expect(results.length).toBeGreaterThan(0);
    // Doc 1 should rank highest (has both 'quick' and 'brown')
    expect(results[0]!.id).toBe('1');
  });
});

describe('packByBudget', () => {
  const items = [
    { id: '1', tokenCost: 10 },
    { id: '2', tokenCost: 20 },
    { id: '3', tokenCost: 30 },
    { id: '4', tokenCost: 50 },
  ];

  it('packs items within budget', () => {
    const result = packByBudget(items, 60);
    expect(result.tokensUsed).toBeLessThanOrEqual(60);
    expect(result.packed.length).toBeGreaterThan(0);
  });

  it('packs greedily in order', () => {
    const result = packByBudget(items, 60);
    // Should pack 1 (10) + 2 (20) + 3 (30) = 60
    expect(result.packed.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(result.tokensUsed).toBe(60);
  });

  it('tracks truncated count', () => {
    const result = packByBudget(items, 60);
    expect(result.truncated).toBe(1); // item 4 didn't fit
  });

  it('handles zero budget', () => {
    const result = packByBudget(items, 0);
    expect(result.packed).toEqual([]);
    expect(result.tokensUsed).toBe(0);
    expect(result.truncated).toBe(4);
  });

  it('handles empty items', () => {
    const result = packByBudget([], 100);
    expect(result.packed).toEqual([]);
    expect(result.tokensUsed).toBe(0);
    expect(result.truncated).toBe(0);
  });

  it('handles large budget that fits all', () => {
    const result = packByBudget(items, 1000);
    expect(result.packed.length).toBe(4);
    expect(result.tokensUsed).toBe(110);
    expect(result.truncated).toBe(0);
  });

  it('skips items that do not fit individually', () => {
    const bigItems = [
      { id: '1', tokenCost: 100 },
      { id: '2', tokenCost: 5 },
    ];
    const result = packByBudget(bigItems, 50);
    expect(result.packed.map((p) => p.id)).toEqual(['2']);
    expect(result.truncated).toBe(1);
  });
});

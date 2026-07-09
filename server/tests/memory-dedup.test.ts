import { describe, it, expect } from 'vitest';
import {
  previewMerge,
  tokenOverlap,
  clusterBySimilarity,
  findDuplicatePairs,
  DEDUP_SIMILARITY_THRESHOLD,
  type MemoryLike,
} from '../src/services/memory-dedup.js';

const like = (id: string, importance: number, tags: string[] = []): MemoryLike => ({
  id,
  title: id,
  content: id,
  importance,
  recallCount: 1,
  tags,
});

describe('memory-dedup / previewMerge', () => {
  it('keeps the higher-importance memory and keeps the other as dropped', () => {
    const a = like('a', 0.9);
    const b = like('b', 0.2);
    const m = previewMerge(a, b);
    expect(m.keptId).toBe('a');
    expect(m.droppedId).toBe('b');
  });

  it('merges tags (union, de-duplicated) and sums recall counts', () => {
    const a = like('a', 0.5, ['x', 'y']);
    const b = like('b', 0.4, ['y', 'z']);
    const m = previewMerge(a, b);
    expect(m.tags.sort()).toEqual(['x', 'y', 'z']);
    expect(m.recallCount).toBe(2);
  });

  it('concatenates content and takes max importance', () => {
    const a = { ...like('a', 0.3), content: 'AAA' };
    const b = { ...like('b', 0.8), content: 'BBB' };
    const m = previewMerge(a, b);
    expect(m.content).toBe('BBB\n\nAAA');
    expect(m.importance).toBe(0.8);
  });

  it('prefers first arg on equal importance', () => {
    const m = previewMerge(like('a', 0.5), like('b', 0.5));
    expect(m.keptId).toBe('a');
  });
});

describe('memory-dedup / tokenOverlap', () => {
  it('is 1.0 for identical normalized text', () => {
    expect(tokenOverlap('The quick brown fox', 'the quick brown fox')).toBe(1);
  });

  it('is 0 for disjoint text', () => {
    expect(tokenOverlap('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
  });

  it('returns 0 when either side has no long tokens', () => {
    expect(tokenOverlap('a b c', 'd e f')).toBe(0);
  });

  it('is monotonic: more shared tokens → higher overlap', () => {
    const low = tokenOverlap('machine learning model', 'fruit apple banana');
    const high = tokenOverlap('machine learning model', 'machine learning system');
    expect(high).toBeGreaterThan(low);
  });
});

describe('memory-dedup / clusterBySimilarity', () => {
  const item = (id: string, text: string, tags: string[] = []) => ({ id, title: text, content: text, tags });

  it('groups items sharing a tag above threshold', () => {
    const groups = clusterBySimilarity(
      [item('a', 'x', ['t1']), item('b', 'y', ['t1']), item('c', 'z', ['t2'])],
      0.25
    );
    // a & b share t1 → grouped; c alone
    const grouped = groups.find((g) => g.includes('a'));
    expect(grouped).toBeDefined();
    expect(grouped).toContain('b');
    expect(grouped).not.toContain('c');
  });

  it('returns each item in its own group when nothing matches', () => {
    const groups = clusterBySimilarity([item('a', 'aaa'), item('b', 'bbb'), item('c', 'ccc')], 0.9);
    expect(groups).toHaveLength(3);
  });

  it('returns empty for empty input', () => {
    expect(clusterBySimilarity([])).toEqual([]);
  });
});

describe('memory-dedup / findDuplicatePairs', () => {
  const mem = (id: string, embedding: number[]) =>
    ({ id, title: id, content: id, embedding, importance: 0, recallCount: 0, tags: [] } as unknown as import('../src/services/memory-hierarchy.js').Memory);

  it('finds pairs above the default threshold', () => {
    const a = mem('a', [1, 0, 0]);
    const b = mem('b', [0.999, 0.001, 0]); // cosine ~1 with a
    const c = mem('c', [0, 1, 0]); // orthogonal to a/b
    const pairs = findDuplicatePairs([a, b, c]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]![0].id, pairs[0]![1].id].sort()).toEqual(['a', 'b']);
  });

  it('respects a custom threshold', () => {
    const a = mem('a', [1, 0, 0]);
    const b = mem('b', [0.5, 0.5, 0]); // cosine 0.707
    expect(findDuplicatePairs([a, b], 0.99)).toHaveLength(0);
    expect(findDuplicatePairs([a, b], 0.5)).toHaveLength(1);
  });

  it('exposes a default threshold constant', () => {
    expect(DEDUP_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(DEDUP_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

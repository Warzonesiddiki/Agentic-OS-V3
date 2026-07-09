import { describe, it, expect } from 'vitest';
import { activeLearningSample } from '../src/services/memory-clustering.js';

interface MemoryVector {
  id: string;
  title: string;
  content: string;
  importance: number;
  embedding: number[];
}

const vec = (id: string, embedding: number[], importance = 0): MemoryVector => ({
  id,
  title: id,
  content: id,
  importance,
  embedding,
});

describe('memory-clustering / activeLearningSample', () => {
  it('ranks everything as novel when no centroids exist', () => {
    const candidates = [vec('a', [1, 0], 0.1), vec('b', [0, 1], 0.9), vec('c', [1, 1], 0.4)];
    const out = activeLearningSample(candidates, []);
    expect(out).toHaveLength(3);
    // Highest importance (b=0.9) → highest uncertainty = 1+0.9 = 1.9
    expect(out[0]?.id).toBe('b');
    expect(out[0]?.uncertainty).toBeCloseTo(1.9);
  });

  it('respects the limit parameter', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => vec(`m${i}`, [i, 0], i));
    const out = activeLearningSample(candidates, [], 2);
    expect(out).toHaveLength(2);
  });

  it('ranks far-from-centroid candidates higher (novelty signal)', () => {
    // Single centroid at origin-of-ones. Candidate far away should outrank near one.
    const centroids = [[1, 1]];
    const near = vec('near', [1.1, 1.1], 0);
    const far = vec('far', [9, 9], 0);
    const out = activeLearningSample([near, far], centroids);
    expect(out[0]?.id).toBe('far');
  });

  it('blends importance so a high-importance novel memory can outrank a more novel low-importance one', () => {
    const centroids = [[0, 0]];
    const veryFarLowImp = vec('v', [20, 20], 0); // high distance, no importance boost
    const midFarHighImp = vec('h', [10, 10], 1); // smaller distance but big importance boost
    const out = activeLearningSample([veryFarLowImp, midFarHighImp], centroids);
    expect(out[0]?.id).toBe('h');
  });

  it('treats dimension-mismatched embeddings as finite uncertainty (no NaN)', () => {
    const centroids = [[1, 1, 1]];
    const bad = vec('bad', [1, 1], 0); // wrong dimension
    const out = activeLearningSample([bad], centroids);
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0]!.uncertainty)).toBe(true);
  });
});

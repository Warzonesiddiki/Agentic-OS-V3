/**
 * Tests for server/src/services/memory-emotion.ts
 *
 * Pure emotion-scoring helpers for memories (no DB required).
 */
import { describe, it, expect } from 'vitest';
import {
  computeEmotionScores,
  blendEmotionWithImportance,
  summarizeEmotion,
  buildEmotionScorer,
  isCalm,
  normalizeEmotions,
  EMOTION_DIMENSIONS,
  type EmotionVector,
} from '../src/services/memory-emotion.js';

const zeroVec: EmotionVector = { valence: 0, arousal: 0, dominance: 0, fear: 0, joy: 0, sadness: 0, anger: 0, surprise: 0 };

describe('EMOTION_DIMENSIONS', () => {
  it('enumerates the 8 canonical dimensions', () => {
    expect(EMOTION_DIMENSIONS).toEqual([
      'valence',
      'arousal',
      'dominance',
      'fear',
      'joy',
      'sadness',
      'anger',
      'surprise',
    ]);
  });
});

describe('computeEmotionScores', () => {
  it('returns a zero vector for empty content', () => {
    expect(computeEmotionScores('')).toEqual(zeroVec);
  });
  it('detects joy lexicon', () => {
    const v = computeEmotionScores('we are happy and excited');
    expect(v.joy).toBeGreaterThan(0);
    expect(v.valence).toBeGreaterThan(0);
  });
  it('detects fear lexicon (negative valence)', () => {
    const v = computeEmotionScores('a terrifying and anxious threat');
    expect(v.fear).toBeGreaterThan(0);
    expect(v.valence).toBeLessThan(0);
  });
  it('detects anger lexicon', () => {
    const v = computeEmotionScores('an angry furious argument');
    expect(v.anger).toBeGreaterThan(0);
  });
  it('detects sadness lexicon', () => {
    const v = computeEmotionScores('a sad lonely grief');
    expect(v.sadness).toBeGreaterThan(0);
  });
  it('detects surprise lexicon', () => {
    const v = computeEmotionScores('a sudden surprise');
    expect(v.surprise).toBeGreaterThan(0);
  });
  it('is case-insensitive', () => {
    expect(computeEmotionScores('HAPPY').joy).toBeGreaterThan(0);
  });
  it('accumulates multiple matches', () => {
    const v = computeEmotionScores('happy happy happy');
    expect(v.joy).toBeGreaterThanOrEqual(3);
  });
});

describe('blendEmotionWithImportance', () => {
  it('keeps importance when emotion magnitude is zero', () => {
    expect(blendEmotionWithImportance(0.7, zeroVec)).toBeCloseTo(0.7, 10);
  });
  it('boosts importance when a strong positive emotion is present', () => {
    const v: EmotionVector = { ...zeroVec, joy: 0.9, valence: 0.9 };
    expect(blendEmotionWithImportance(0.5, v)).toBeGreaterThan(0.5);
  });
  it('reduces importance for strong negative emotions', () => {
    const v: EmotionVector = { ...zeroVec, fear: 0.9, valence: -0.9 };
    expect(blendEmotionWithImportance(0.5, v)).toBeLessThan(0.5);
  });
  it('clamps result to [0,1]', () => {
    const v: EmotionVector = { ...zeroVec, joy: 5 };
    expect(blendEmotionWithImportance(0.99, v)).toBeLessThanOrEqual(1);
  });
});

describe('summarizeEmotion', () => {
  it('returns neutral for a zero vector', () => {
    expect(summarizeEmotion(zeroVec)).toBe('neutral');
  });
  it('returns the dominant positive label', () => {
    const v: EmotionVector = { ...zeroVec, joy: 0.8, valence: 0.5 };
    expect(summarizeEmotion(v)).toBe('joy');
  });
  it('returns the dominant negative label', () => {
    const v: EmotionVector = { ...zeroVec, anger: 0.8, valence: -0.5 };
    expect(summarizeEmotion(v)).toBe('anger');
  });
  it('prefers a strong negative over weak positive', () => {
    const v: EmotionVector = { ...zeroVec, joy: 0.2, fear: 0.9 };
    expect(summarizeEmotion(v)).toBe('fear');
  });
});

describe('isCalm', () => {
  it('is true for a calm vector', () => {
    expect(isCalm(zeroVec)).toBe(true);
  });
  it('is false for high arousal', () => {
    expect(isCalm({ ...zeroVec, arousal: 0.9 })).toBe(false);
  });
  it('is false for a strong emotion', () => {
    expect(isCalm({ ...zeroVec, fear: 0.6 })).toBe(false);
  });
});

describe('normalizeEmotions', () => {
  it('returns a zero vector unchanged', () => {
    expect(normalizeEmotions(zeroVec)).toEqual(zeroVec);
  });
  it('scales a vector so its max magnitude is 1', () => {
    const v: EmotionVector = { ...zeroVec, joy: 2, anger: 0.5 };
    const n = normalizeEmotions(v);
    expect(Math.max(...Object.values(n))).toBeCloseTo(1, 10);
  });
});

describe('buildEmotionScorer', () => {
  it('returns a scorer whose importance matches blendEmotionWithImportance', () => {
    const scorer = buildEmotionScorer();
    const v: EmotionVector = { ...zeroVec, joy: 0.5 };
    const direct = blendEmotionWithImportance(0.6, v);
    const viaScorer = scorer(0.6, v);
    expect(viaScorer).toBeCloseTo(direct, 10);
  });
});

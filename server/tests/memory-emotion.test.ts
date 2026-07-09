/**
 * Tests for server/src/services/memory-emotion.ts
 *
 * Phase 12 emotion-tagged memory support. `normalizeEmotionVector` is pure;
 * `classifyMemoryEmotion`/`storeMemoryEmotion` are LLM/DB-backed and mocked.
 */
import { describe, it, expect, vi } from 'vitest';

// LLM + db are mocked so we can exercise classify/store without a provider.
const stored: Array<Record<string, unknown>> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        stored.push(row);
        return Promise.resolve(undefined);
      },
    }),
  },
  isSqlite: true,
}));

vi.mock('../src/db/schema.js', () => ({
  memoryEmotions: { _kind: 'table' },
}));

vi.mock('../src/services/llm-client.js', () => ({
  callLLMStructuredWithTrajectory: (_sys: string, content: string) => {
    const hot = content.includes('love') || content.includes('joy');
    const bad = content.includes('fear') || content.includes('angry');
    return Promise.resolve({
      joy: hot ? 0.9 : 0.1,
      surprise: 0.2,
      fear: bad ? 0.8 : 0.1,
      anger: bad ? 0.6 : 0.1,
      sadness: 0.1,
      disgust: 0.1,
      trust: 0.5,
      anticipation: 0.4,
    });
  },
}));

import {
  EMOTIONS,
  normalizeEmotionVector,
  classifyMemoryEmotion,
  storeMemoryEmotion,
} from '../src/services/memory-emotion.js';

describe('EMOTIONS', () => {
  it('lists the 8 canonical emotions', () => {
    expect(EMOTIONS).toEqual([
      'joy',
      'surprise',
      'fear',
      'anger',
      'sadness',
      'disgust',
      'trust',
      'anticipation',
    ]);
  });
});

describe('normalizeEmotionVector', () => {
  it('clamps each dimension into [0,1] and fills missing with 0', () => {
    const v = normalizeEmotionVector({ joy: 5, fear: -2, trust: 0.4 });
    expect(v.joy).toBe(1);
    expect(v.fear).toBe(0);
    expect(v.trust).toBe(0.4);
    expect(v.sadness).toBe(0);
    expect(v.anticipation).toBe(0);
  });
  it('coerces non-numeric values to 0', () => {
    const v = normalizeEmotionVector({ joy: 'high', anger: null });
    expect(v.joy).toBe(0);
    expect(v.anger).toBe(0);
  });
  it('treats NaN/Infinity as 0', () => {
    const v = normalizeEmotionVector({ joy: NaN, trust: Infinity });
    expect(v.joy).toBe(0);
    expect(v.trust).toBe(0);
  });
  it('clamps finite values above 1 down to 1', () => {
    expect(normalizeEmotionVector({ joy: 5 }).joy).toBe(1);
  });
  it('produces a complete vector across all 8 emotions', () => {
    const v = normalizeEmotionVector({});
    expect(Object.keys(v).sort()).toEqual([...EMOTIONS].sort());
  });
});

describe('classifyMemoryEmotion', () => {
  it('returns a normalized vector from the LLM', async () => {
    const v = await classifyMemoryEmotion('this is joyful and loving');
    expect(v.joy).toBeGreaterThan(0.5);
    expect(v.fear).toBeLessThan(0.5);
  });
  it('detects negative emotional content', async () => {
    const v = await classifyMemoryEmotion('a fearful and angry scene');
    expect(v.fear).toBeGreaterThan(0.5);
    expect(v.anger).toBeGreaterThan(0.5);
  });
  it('returns a fully-formed vector', async () => {
    const v = await classifyMemoryEmotion('neutral memory');
    expect(Object.keys(v).sort()).toEqual([...EMOTIONS].sort());
  });
});

describe('storeMemoryEmotion', () => {
  it('classifies and persists an emotion row', async () => {
    stored.length = 0;
    const cls = await storeMemoryEmotion('mem-1', 'we felt joy');
    expect(cls.memoryId).toBe('mem-1');
    expect(cls.emotions.joy).toBeGreaterThan(0.5);
    expect(stored).toHaveLength(1);
    expect(stored[0].memoryId).toBe('mem-1');
    expect(typeof stored[0].id).toBe('string');
  });

  it('honors an explicit model override', async () => {
    stored.length = 0;
    const cls = await storeMemoryEmotion('mem-2', 'tense and fearful', { model: 'm-7' });
    expect(cls.model).toBe('m-7');
    expect(stored[0].model).toBe('m-7');
  });
});

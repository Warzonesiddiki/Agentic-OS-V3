import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/llm-client.js', () => ({
  callLLMStructuredWithTrajectory: vi.fn(),
}));
vi.mock('../src/services/recall.js', () => ({
  recall: vi.fn(),
}));
vi.mock('../src/services/memory-provenance.js', () => ({
  recordMemoryInfluences: vi.fn(async () => []),
}));

import {
  classifyMemoryEmotion,
  normalizeEmotionVector,
  EMOTIONS,
} from '../src/services/memory-emotion.js';
import { buildSessionPriming, PRIMING_BUDGET_TOKENS } from '../src/services/memory-priming.js';
import { explainRecallResults } from '../src/services/memory-search-explanation.js';
import { callLLMStructuredWithTrajectory } from '../src/services/llm-client.js';
import { recall } from '../src/services/recall.js';

describe('memory-emotion classification shape', () => {
  it('normalizeEmotionVector clamps and fills all 8 emotions', () => {
    const v = normalizeEmotionVector({ joy: 0.9, fear: 2, anger: -1, surprise: 'x' });
    expect(Object.keys(v).sort()).toEqual([...EMOTIONS].sort());
    for (const e of EMOTIONS) {
      expect(typeof v[e]).toBe('number');
      expect(v[e]).toBeGreaterThanOrEqual(0);
      expect(v[e]).toBeLessThanOrEqual(1);
    }
    expect(v.joy).toBeCloseTo(0.9);
    expect(v.fear).toBe(1);
    expect(v.anger).toBe(0);
  });

  it('classifyMemoryEmotion returns 8 emotions in [0,1] via the LLM', async () => {
    vi.mocked(callLLMStructuredWithTrajectory).mockResolvedValue({
      joy: 0.5,
      surprise: 0.2,
      fear: 0,
      anger: 0,
      sadness: 0.1,
      disgust: 0,
      trust: 0.8,
      anticipation: 0.3,
    });
    const v = await classifyMemoryEmotion('I love this!');
    expect(Object.keys(v).sort()).toEqual([...EMOTIONS].sort());
    for (const e of EMOTIONS) {
      expect(v[e]).toBeGreaterThanOrEqual(0);
      expect(v[e]).toBeLessThanOrEqual(1);
    }
  });
});

describe('memory-priming budget cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps total token usage within the priming budget', async () => {
    const longContent = 'word '.repeat(400);
    vi.mocked(recall).mockResolvedValue({
      query: 'task',
      returned: Array.from({ length: 8 }, (_, i) => ({
        id: `mem_${i}`,
        type: 'memory' as const,
        title: `Memory ${i}`,
        content: longContent,
        source: 'user',
        score: 1 - i * 0.01,
        tokenCost: 400,
        matchedBy: ['semantic'] as ('bm25' | 'semantic')[],
      })),
      mode: 'semantic',
      tokensUsed: 0,
      tokenBudget: 2000,
      truncated: 0,
    });
    const res = await buildSessionPriming('plan the launch', { budget: PRIMING_BUDGET_TOKENS });
    expect(res.tokenUsage).toBeLessThanOrEqual(PRIMING_BUDGET_TOKENS);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.length).toBeLessThanOrEqual(5);
  });
});

describe('memory-search-explanation breakdown fields', () => {
  it('returns all six breakdown fields per result', () => {
    const results = {
      query: 'react hooks',
      returned: [
        {
          id: 'a',
          type: 'memory' as const,
          title: 'React hooks',
          content: 'React hooks let you use state',
          source: 'user',
          score: 0.8,
          tokenCost: 10,
          matchedBy: ['bm25', 'semantic'] as ('bm25' | 'semantic')[],
        },
        {
          id: 'b',
          type: 'memory' as const,
          title: 'Cooking notes',
          content: 'unrelated text about cooking',
          source: 'user',
          score: 0.2,
          tokenCost: 8,
          matchedBy: ['bm25'] as ('bm25' | 'semantic')[],
        },
      ],
      mode: 'semantic' as const,
      tokensUsed: 18,
      tokenBudget: 2000,
      truncated: 0,
    };
    const explained = explainRecallResults(results);
    expect(explained.items).toHaveLength(2);
    for (const item of explained.items) {
      expect(typeof item.breakdown.bm25Score).toBe('number');
      expect(typeof item.breakdown.cosineScore).toBe('number');
      expect(typeof item.breakdown.importanceScore).toBe('number');
      expect(typeof item.breakdown.rrfScore).toBe('number');
      expect(typeof item.breakdown.finalScore).toBe('number');
      expect(Array.isArray(item.breakdown.matchedTerms)).toBe(true);
    }
    const firstItem = explained.items[0];
    if (!firstItem) throw new Error('expected at least one explained item');
    expect(firstItem.breakdown.matchedTerms).toContain('react');
    expect(firstItem.breakdown.finalScore).toBeCloseTo(0.8);
  });
});

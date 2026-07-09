import { describe, it, expect, beforeEach } from 'vitest';
import {
  trainRanker,
  getRankerWeights,
  resetRankerWeights,
  rankWithLearnedWeights,
  DEFAULT_WEIGHTS,
  type RankCandidate,
  type FeedbackTriple,
} from '../src/services/ranking-trainer.js';
import {
  selectForConsolidation,
  type ConsolidationMemory,
} from '../src/services/consolidation-budget.js';
import { detectMemoryAnomalies, type AnomalyMemory } from '../src/services/memory-anomaly.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('ranking-trainer', () => {
  beforeEach(() => {
    resetRankerWeights();
  });

  it('training changes weights and reorders candidates versus defaults', () => {
    const triples: FeedbackTriple[] = [];
    for (let i = 0; i < 5; i++) {
      triples.push({ features: { rrf: 0, importance: 0, recency: 1, feedback: 0 }, helpful: true });
      triples.push({
        features: { rrf: 0, importance: 1, recency: 0, feedback: 0 },
        helpful: false,
      });
    }

    const learned = trainRanker(triples);
    expect(learned).not.toEqual(DEFAULT_WEIGHTS);
    expect(learned.recency).toBeGreaterThan(learned.importance);

    const x: RankCandidate = { id: 'X', rrf: 0, importance: 1, recency: 0, feedback: 0 };
    const y: RankCandidate = { id: 'Y', rrf: 0, importance: 0, recency: 1, feedback: 0 };

    const defaultRanked = rankWithLearnedWeights([x, y], DEFAULT_WEIGHTS);
    const defaultTop = defaultRanked[0];
    if (defaultTop === undefined) throw new Error('expected defaultRanked[0]');
    expect(defaultTop.id).toBe('X');

    const learnedRanked = rankWithLearnedWeights([x, y], learned);
    const learnedTop = learnedRanked[0];
    if (learnedTop === undefined) throw new Error('expected learnedRanked[0]');
    expect(learnedTop.id).toBe('Y');
  });

  it('empty triples return defaults and leave current weights unchanged', () => {
    const result = trainRanker([]);
    expect(result).toEqual(DEFAULT_WEIGHTS);
    expect(getRankerWeights()).toEqual(DEFAULT_WEIGHTS);
  });

  it('rankWithLearnedWeights sorts by score descending (stable)', () => {
    const candidates: RankCandidate[] = [
      { id: 'a', rrf: 0, importance: 0.2, recency: 0, feedback: 0 },
      { id: 'b', rrf: 0, importance: 0.9, recency: 0, feedback: 0 },
      { id: 'c', rrf: 0, importance: 0.2, recency: 0, feedback: 0 },
    ];
    const ranked = rankWithLearnedWeights(candidates, DEFAULT_WEIGHTS);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    const top = ranked[0];
    if (top === undefined) throw new Error('expected ranked[0]');
    expect(top.score).toBeCloseTo(0.9 * DEFAULT_WEIGHTS.importance, 6);
  });
});

describe('consolidation-budget', () => {
  it('promotes high-importance within budget and archives the rest', () => {
    const memories: ConsolidationMemory[] = [
      { id: 'A', importance: 0.9, tokens: 6 },
      { id: 'B', importance: 0.8, tokens: 6 },
      { id: 'C', importance: 0.1, tokens: 5 },
    ];
    const plan = selectForConsolidation(memories, 10);
    expect(plan.promote.map((m) => m.id)).toEqual(['A']);
    expect(plan.archive.map((m) => m.id).sort()).toEqual(['B', 'C']);
    expect(plan.usedTokens).toBe(6);
    expect(plan.remainingTokens).toBe(4);
    expect(plan.totalTokens).toBe(17);
  });

  it('zero-token items are always promoted; large budget promotes all', () => {
    const memories: ConsolidationMemory[] = [
      { id: 'Z', importance: 0.1, tokens: 0 },
      { id: 'W', importance: 0.5, tokens: 3 },
    ];
    const small = selectForConsolidation(memories, 2);
    expect(small.promote.map((m) => m.id)).toEqual(['Z']);
    expect(small.archive.map((m) => m.id)).toEqual(['W']);

    const big = selectForConsolidation(memories, 100);
    expect(big.promote.map((m) => m.id).sort()).toEqual(['W', 'Z']);
  });

  it('empty input returns empty plan with remaining budget', () => {
    const plan = selectForConsolidation([], 50);
    expect(plan.promote).toEqual([]);
    expect(plan.archive).toEqual([]);
    expect(plan.remainingTokens).toBe(50);
  });
});

describe('memory-anomaly', () => {
  it('flags stale high-importance recent memories and ignores others', () => {
    const now = new Date('2026-07-08T12:00:00Z');
    const mk = (
      id: string,
      lastAccessedAt: Date | null,
      createdDaysAgo: number,
      importance = 0.9
    ): AnomalyMemory => ({
      id,
      agentId: 'agent-a',
      importance,
      lastAccessedAt,
      createdAt: new Date(now.getTime() - createdDaysAgo * DAY),
    });

    const memories: AnomalyMemory[] = [
      mk('m1', new Date(now.getTime() - 72 * HOUR), 2),
      mk('m2', new Date(now.getTime() - 1 * HOUR), 2),
      mk('m3', new Date(now.getTime() - 100 * HOUR), 2, 0.4),
      mk('m4', null, 1),
      mk('m5', new Date(now.getTime() - 72 * HOUR), 30),
    ];

    const res = detectMemoryAnomalies(memories, { now });
    const ids = res.map((r) => r.memoryId);
    expect(ids).toContain('m1');
    expect(ids).toContain('m4');
    expect(ids).not.toContain('m2');
    expect(ids).not.toContain('m3');
    expect(ids).not.toContain('m5');
  });
});

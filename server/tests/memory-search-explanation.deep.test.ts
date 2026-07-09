import { describe, it, expect } from 'vitest';
import {
  explainRecallResults,
  type RecallItem,
  type RecallResult,
} from '../src/services/memory-search-explanation.js';

const item = (over: Partial<RecallItem>): RecallItem => ({
  id: 'x',
  type: 'memory',
  title: 't',
  content: 't',
  score: 0,
  tokenCost: 0,
  source: 'src',
  matchedBy: [],
  ...over,
});

const result = (over: Partial<RecallResult>): RecallResult => ({
  query: 'gateway',
  returned: [],
  tokensUsed: 0,
  tokenBudget: 100,
  truncated: 0,
  mode: 'lexical',
  ...over,
});

describe('memory-search-explanation / explainRecallResults (deep)', () => {
  it('ranks by bm25 so the top result gets the highest rrf score', () => {
    const out = explainRecallResults(
      result({
        returned: [
          item({ id: 'a', content: 'gateway gateway gateway', score: 0.9 }),
          item({ id: 'b', content: 'gateway', score: 0.8 }),
          item({ id: 'c', content: 'unrelated words only', score: 0.1 }),
        ],
      })
    );
    const a = out.items.find((i) => i.id === 'a')!;
    const b = out.items.find((i) => i.id === 'b')!;
    const c = out.items.find((i) => i.id === 'c')!;
    // a has the highest bm25 -> rank 0 -> highest rrf
    expect(a.breakdown.rrfScore).toBeGreaterThan(b.breakdown.rrfScore);
    expect(b.breakdown.rrfScore).toBeGreaterThan(c.breakdown.rrfScore);
  });

  it('rrfScore follows the 1/(K+rank+1) formula with RRF_K=60', () => {
    const out = explainRecallResults(result({ returned: [item({ id: 'a', content: 'gateway', score: 0.5 })] }));
    // rank 0 -> 1/(60+0+1) = 1/61
    expect(out.items[0]!.breakdown.rrfScore).toBeCloseTo(1 / 61, 4);
  });

  it('cosineScore is only set when matchedBy includes semantic (and is bounded)', () => {
    const out = explainRecallResults(
      result({
        returned: [
          item({ id: 'a', content: 'gateway', score: 1.7, matchedBy: ['semantic'] }),
          item({ id: 'b', content: 'gateway', score: 0.8, matchedBy: ['bm25'] }),
        ],
      })
    );
    const a = out.items.find((i) => i.id === 'a')!;
    const b = out.items.find((i) => i.id === 'b')!;
    expect(a.breakdown.cosineScore).toBeCloseTo(1, 4); // min(1, score)
    expect(b.breakdown.cosineScore).toBe(0);
  });

  it('matchedTerms are extracted from the query against content', () => {
    const out = explainRecallResults(result({ returned: [item({ id: 'a', content: 'the payment gateway is down', score: 0.9 })] }));
    expect(out.items[0]!.breakdown.matchedTerms).toContain('gateway');
  });

  it('finalScore mirrors the item score', () => {
    const out = explainRecallResults(result({ returned: [item({ id: 'a', content: 'gateway', score: 0.42 })] }));
    expect(out.items[0]!.breakdown.finalScore).toBeCloseTo(0.42, 4);
  });

  it('preserves the query and mode', () => {
    const out = explainRecallResults(result({ query: 'alpha', mode: 'semantic', returned: [] }));
    expect(out.query).toBe('alpha');
    expect(out.mode).toBe('semantic');
  });
});

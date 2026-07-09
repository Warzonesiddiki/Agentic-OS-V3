import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fed } = vi.hoisted(() => ({
  fed: {
    search: vi.fn(async () => ({
      returned: [
        { id: 'm1', content: 'The payment gateway failed at checkout.', score: 0.9 },
        { id: 'm2', content: 'We rolled out a fix for checkout.', score: 0.7 },
      ],
    })),
  },
}));

vi.mock('../src/services/federated-recall.js', () => ({ fedRecall: fed }));

import { answerNaturalLanguageQuery, parseNaturalLanguageQuery } from '../src/services/memory-nl-query.js';

describe('memory-nl-query / answerNaturalLanguageQuery', () => {
  beforeEach(() => fed.search.mockClear());

  it('routes the parsed topic to fedRecall.search with sensible options', async () => {
    await answerNaturalLanguageQuery('what happened with the payment gateway last week');
    expect(fed.search).toHaveBeenCalledTimes(1);
    const arg = fed.search.mock.calls[0]![0];
    expect(arg.text).toContain('payment gateway');
    expect(arg.options.limit).toBeGreaterThan(0);
    expect(arg.options.dedupeContent).toBe(true);
  });

  it('returns parsed metadata, an answer string, and recall summaries', async () => {
    const r = await answerNaturalLanguageQuery('anything about the payment gateway');
    expect(r.query).toContain('payment gateway');
    expect(r.parsed.topic).toContain('payment gateway');
    expect(typeof r.answer).toBe('string');
    expect(r.answer.length).toBeGreaterThan(0);
    expect(r.results).toHaveLength(2);
    expect(r.results[0]!.id).toBe('m1');
  });

  it('falls back to the raw input when no topic is parsed', async () => {
    const r = await answerNaturalLanguageQuery('show me everything');
    expect(fed.search.mock.calls[0]![0].text.length).toBeGreaterThan(0);
    expect(typeof r.answer).toBe('string');
  });
});

describe('memory-nl-query / parseNaturalLanguageQuery (regression)', () => {
  it('extracts a plain topic with no time expression', () => {
    const r = parseNaturalLanguageQuery('what do we know about the payment gateway');
    expect(r.topic).toContain('payment gateway');
    expect(r.timeExpr).toBeNull();
  });

  it('captures "N days" relative time', () => {
    const r = parseNaturalLanguageQuery('show me everything from the last 7 days');
    expect(r.timeExpr).toBe('7 days');
    expect(r.timeFrom).not.toBeNull();
  });
});

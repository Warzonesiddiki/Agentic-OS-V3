import { bm25 } from '../lib/tokens.js';
import type { RecallItem, RecallResult } from './recall.js';

export interface RecallBreakdown {
  bm25Score: number;
  cosineScore: number;
  importanceScore: number;
  rrfScore: number;
  finalScore: number;
  matchedTerms: string[];
}

export type ExplainedRecallItem = RecallItem & { breakdown: RecallBreakdown };

export interface ExplainedRecallResult {
  query: string;
  items: ExplainedRecallItem[];
  mode: 'lexical' | 'semantic';
}

const RRF_K = 60;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeMatchedTerms(query: string, content: string): string[] {
  const queryTerms = tokenize(query);
  const haystack = content.toLowerCase();
  const matched = new Set<string>();
  for (const term of queryTerms) {
    if (haystack.includes(term)) matched.add(term);
  }
  return [...matched];
}

function computeBm25Score(content: string, query: string, id: string): number {
  const scored = bm25([{ id, text: content }], query);
  const first = scored[0];
  return first ? first.score : 0;
}

export function explainRecallResults(results: RecallResult): ExplainedRecallResult {
  const query = results.query;

  const bm25ByItem = new Map<string, number>();
  for (const item of results.returned) {
    bm25ByItem.set(item.id, computeBm25Score(item.content, query, item.id));
  }

  const ranked = [...results.returned].sort(
    (a, b) => (bm25ByItem.get(b.id) ?? 0) - (bm25ByItem.get(a.id) ?? 0)
  );
  const rankById = new Map<string, number>();
  ranked.forEach((item, index) => rankById.set(item.id, index));

  const items: ExplainedRecallItem[] = results.returned.map((item) => {
    const rank = rankById.get(item.id) ?? 0;
    const breakdown: RecallBreakdown = {
      bm25Score: round4(bm25ByItem.get(item.id) ?? 0),
      cosineScore: round4(item.matchedBy.includes('semantic') ? Math.min(1, item.score) : 0),
      importanceScore: 0,
      rrfScore: round4(1 / (RRF_K + rank + 1)),
      finalScore: round4(item.score),
      matchedTerms: computeMatchedTerms(query, item.content),
    };
    return { ...item, breakdown };
  });

  return { query, items, mode: results.mode };
}

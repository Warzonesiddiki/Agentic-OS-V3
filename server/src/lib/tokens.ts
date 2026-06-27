/**
 * tokens.ts — token estimation, token-budgeted packing, and BM25 lexical
 * scoring. Pure functions, fully unit-testable, no I/O.
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on", "for",
  "with", "as", "by", "at", "it", "this", "that", "be", "from", "i", "you", "we", "they", "do",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Scored {
  id: string;
  score: number;
}

/** BM25 over an in-memory corpus. */
export function bm25(docs: { id: string; text: string }[], query: string, k1 = 1.5, b = 0.75): Scored[] {
  const qTerms = tokenize(query);
  if (!qTerms.length || !docs.length) return [];
  const N = docs.length;
  const df = new Map<string, number>();
  const prepared = docs.map((d) => {
    const tf = new Map<string, number>();
    let len = 0;
    for (const t of tokenize(d.text)) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
      len++;
    }
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: d.id, tf, len };
  });
  const avgLen = prepared.reduce((s, x) => s + x.len, 0) / N || 1;

  const out: Scored[] = [];
  for (const p of prepared) {
    let score = 0;
    for (const qt of qTerms) {
      const f = p.tf.get(qt) ?? 0;
      if (!f) continue;
      const d = df.get(qt) ?? 0;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      const denom = f + k1 * (1 - b + b * (p.len / avgLen));
      score += (idf * (f * (k1 + 1))) / denom;
    }
    if (score > 0) out.push({ id: p.id, score });
  }
  return out.sort((x, y) => y.score - x.score);
}

export interface PackResult<T> {
  packed: T[];
  tokensUsed: number;
  truncated: number;
}

/** Greedily pack items under a token budget. Never exceeds budget. */
export function packByBudget<T extends { tokenCost: number }>(items: T[], budget: number): PackResult<T> {
  let tokensUsed = 0;
  const packed: T[] = [];
  let truncated = 0;
  for (const item of items) {
    if (tokensUsed + item.tokenCost <= budget) {
      packed.push(item);
      tokensUsed += item.tokenCost;
    } else {
      truncated++;
    }
  }
  return { packed, tokensUsed, truncated };
}

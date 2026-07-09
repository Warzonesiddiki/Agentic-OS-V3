import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope } from '../lib/auth-context.js';
import { db, memories } from '../db/client.js';
import { ok } from '../lib/envelope.js';

export interface Suggestion {
  title: string;
  score: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  terms: Map<string, number>;
}

export class MemorySuggester {
  private readonly root: TrieNode = { children: new Map(), terms: new Map() };

  insert(title: string, frequency = 1): void {
    const norm = title.toLowerCase().trim();
    if (norm.length === 0) return;
    this.insertTerm(norm, frequency, title);
    const words = norm.split(/\s+/).filter((w) => w.length > 0);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      this.insertTerm(bigram, frequency, title);
    }
  }

  private insertTerm(term: string, frequency: number, title: string): void {
    let node: TrieNode = this.root;
    for (const ch of term) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), terms: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.terms.set(title, (node.terms.get(title) ?? 0) + frequency);
  }

  suggest(query: string, limit = 8): Suggestion[] {
    const q = query.toLowerCase().trim();
    let node: TrieNode = this.root;
    for (const ch of q) {
      const next = node.children.get(ch);
      if (!next) return [];
      node = next;
    }
    const collected = new Map<string, number>();
    this.collect(node, collected);
    return [...collected.entries()]
      .map((entry) => ({ title: entry[0], score: entry[1] }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, limit);
  }

  private collect(node: TrieNode, out: Map<string, number>): void {
    for (const [title, score] of node.terms) {
      out.set(title, Math.max(out.get(title) ?? 0, score));
    }
    for (const child of node.children.values()) this.collect(child, out);
  }
}

export const router = new Hono<NexusEnv>();

router.get('/api/memories/suggest', async (c) => {
  await requireScope(c, 'memory:read');
  const q = c.req.query('q') ?? '';
  const rows = await db
    .select({ title: memories.title, recallCount: memories.recallCount })
    .from(memories);
  const suggester = new MemorySuggester();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (typeof r.title === 'string' && r.title.length > 0) {
      const freq = typeof r.recallCount === 'number' ? r.recallCount : 1;
      suggester.insert(r.title, Math.max(1, freq));
    }
  }
  const suggestions = suggester.suggest(q, 8);
  return c.json(ok({ query: q, suggestions }, c.get('requestId') ?? ''), 200);
});

export default router;

/**
 * memory-search-suggest.ts — Phase 12.32
 * Autocomplete + query suggestion for the memory search box.
 *
 * Provides prefix autocomplete from existing tags + recent query
 * history (the `feedback`-derived `query` field) and NL query
 * suggestions generated from cluster labels. Pure helpers are
 * unit-tested without a DB; the DB path backs the live UI.
 */
import { db } from '../db/client.js';
import { memoryClusters, tagTaxonomy } from '../db/client.js';

export interface Suggestion {
  value: string;
  type: 'tag' | 'history' | 'cluster';
  score: number;
}

/* ─── Tag LRU cache (perfA: avoid repeated full-table tag scans per keystroke) ───
 * The live `suggest()` path queries `tagTaxonomy` (up to 200 rows) on every
 * keystroke. Tags change rarely, so we memoize per projectId with a short TTL and
 * an LRU eviction bound. Same shape as the LRU uses elsewhere in the server. */
interface TagCacheEntry {
  tags: string[];
  expiresAt: number;
}
const TAG_TTL_MS = Number(process.env.NEXUS_TAG_CACHE_TTL_MS ?? 60_000);
const TAG_CACHE_MAX = Number(process.env.NEXUS_TAG_CACHE_MAX ?? 64);
const tagCache = new Map<string, TagCacheEntry>();

function tagCacheGet(projectId: string): string[] | undefined {
  const entry = tagCache.get(projectId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    tagCache.delete(projectId);
    return undefined;
  }
  // LRU touch
  tagCache.delete(projectId);
  tagCache.set(projectId, entry);
  return entry.tags;
}

async function tagCacheGetOrLoad(projectId: string): Promise<string[]> {
  const cached = tagCacheGet(projectId);
  if (cached) return cached;
  const tagRows = await db.select({ name: tagTaxonomy.name }).from(tagTaxonomy).limit(200);
  const tags = tagRows.map((t: { name: string }) => t.name);
  if (tagCache.size >= TAG_CACHE_MAX) {
    const oldest = tagCache.keys().next().value;
    if (oldest !== undefined) tagCache.delete(oldest);
  }
  tagCache.set(projectId, { tags, expiresAt: Date.now() + TAG_TTL_MS });
  return tags;
}

/** Diagnostics: number of cached tag sets. */
export function tagCacheSize(): number {
  return tagCache.size;
}

/** Clear the tag LRU (used on tag writes / tests). */
export function clearTagCache(): void {
  tagCache.clear();
}

/**
 * Prefix autocomplete over tags + recent query history.
 * `limit` caps results; results are scored by frequency then recency.
 */
export function autocomplete(
  prefix: string,
  history: string[],
  tags: string[],
  limit = 8
): Suggestion[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  const out: Suggestion[] = [];

  for (const t of tags) {
    if (t.toLowerCase().startsWith(p)) {
      out.push({ value: t, type: 'tag', score: 2 });
    }
  }
  for (const h of history) {
    if (h.toLowerCase().includes(p)) {
      out.push({ value: h, type: 'history', score: 1 });
    }
  }
  // de-dup by value, keep highest score
  const map = new Map<string, Suggestion>();
  for (const s of out) {
    const cur = map.get(s.value);
    if (!cur || s.score > cur.score) map.set(s.value, s);
  }
  return [...map.values()]
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** NL query suggestions derived from cluster labels for a project. */
export async function suggestQueries(projectId: string, limit = 8): Promise<Suggestion[]> {
  const clusters = (await db
    .select({ label: memoryClusters.label })
    .from(memoryClusters)
    .limit(limit)) as Array<{ label: string }>;
  return clusters.map((c: { label: string }, i: number) => ({
    value: `memories about ${c.label}`,
    type: 'cluster' as const,
    score: limit - i,
  }));
}

/**
 * MemorySuggester — stateful helper used by the route/UI. Wraps
 * {@link autocomplete} with a live history buffer.
 */
export class MemorySuggester {
  private history: string[] = [];
  constructor(private projectId: string) {}

  pushHistory(q: string): void {
    if (q && !this.history.includes(q)) this.history.unshift(q);
    if (this.history.length > 50) this.history.pop();
  }

  async suggest(prefix: string): Promise<Suggestion[]> {
    const tags = await tagCacheGetOrLoad(this.projectId);
    return autocomplete(prefix, this.history, tags);
  }
}

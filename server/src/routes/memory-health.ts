/**
 * routes/memory-health.ts — Memory Health dashboard metrics.
 *
 * GET /api/memory-health returns aggregate health signals for the memory
 * store: total count, fragmentation ratio, decay percentiles, dedup rate,
 * contradiction count, budget utilization, plus supporting breakdowns.
 *
 * NOTE: the dedicated fragmentation service (memory-fragmentation.ts) is owned
 * by another agent and is not present yet. fragmentationRatio is therefore
 * computed inline as a low-importance share approximation. Swap in the
 * external getFragmentationScore() here once that module is available.
 */
import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope } from '../lib/auth-context.js';
import { ok } from '../lib/envelope.js';
import { db, memories } from '../db/client.js';

interface MemRow {
  id: string;
  kind: string;
  title: string;
  content: string;
  importance: number;
  tokenCost: number;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
}

interface MemoryHealthPayload {
  total: number;
  fragmentationRatio: number;
  decay: { p50: number; p90: number; p99: number };
  dedupRate: number;
  contradictions: number;
  budgetUtilization: number;
  avgImportance: number;
  kindBreakdown: { kind: string; count: number }[];
  trend: number[];
  generatedAt: number;
}

const HALFLIFE_MS = 30 * 24 * 60 * 60 * 1000;
const BUCKET_MS = 30 * 24 * 60 * 60 * 1000;

function normalize(text: string): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function toTimestamp(value: string | Date | null): number {
  if (!value) return Number.NaN;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? Number.NaN : t;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  const v = sorted[idx];
  return v === undefined ? 0 : v;
}

function buildTrend(bucketCounts: Map<number, number>): number[] {
  if (bucketCounts.size === 0) return [0];
  const sortedBuckets = Array.from(bucketCounts.keys()).sort((a, b) => a - b);
  const series: number[] = [];
  let running = 0;
  for (const b of sortedBuckets) {
    running += bucketCounts.get(b) ?? 0;
    series.push(running);
  }
  return series;
}

export const memoryHealth = new Hono<NexusEnv>();

memoryHealth.get('/api/memory-health', async (c) => {
  await requireScope(c, 'memory:read');

  const rowsResult = await db
    .select({
      id: memories.id,
      kind: memories.kind,
      title: memories.title,
      content: memories.content,
      importance: memories.importance,
      tokenCost: memories.tokenCost,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories);
  const rows: MemRow[] = Array.isArray(rowsResult) ? rowsResult : [];

  const total = rows.length;

  let lowImportance = 0;
  let totalTokens = 0;
  let importanceSum = 0;
  const decayValues: number[] = [];
  const seenHashes = new Set<string>();
  let duplicates = 0;
  const titleGroups = new Map<string, Set<string>>();
  const kindCounts = new Map<string, number>();
  const bucketCounts = new Map<number, number>();

  for (const r of rows) {
    const imp = Number(r.importance ?? 0);
    if (imp < 0.34) lowImportance += 1;
    importanceSum += imp;
    totalTokens += Number(r.tokenCost ?? 0);

    const updatedTs = toTimestamp(r.updatedAt);
    const decay = Number.isNaN(updatedTs)
      ? 1
      : Math.min(
          1,
          Math.max(0, 1 - Math.pow(0.5, Math.max(0, Date.now() - updatedTs) / HALFLIFE_MS))
        );
    decayValues.push(decay);

    const hash = normalize(`${r.title} ${r.content}`);
    if (seenHashes.has(hash)) duplicates += 1;
    else seenHashes.add(hash);

    const titleKey = normalize(r.title);
    let group = titleGroups.get(titleKey);
    if (!group) {
      group = new Set<string>();
      titleGroups.set(titleKey, group);
    }
    group.add(normalize(r.content));

    kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);

    const createdTs = toTimestamp(r.createdAt);
    if (!Number.isNaN(createdTs)) {
      const bucket = Math.floor(createdTs / BUCKET_MS);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }
  }

  decayValues.sort((a, b) => a - b);

  let contradictions = 0;
  for (const contents of titleGroups.values()) {
    if (contents.size > 1) contradictions += contents.size - 1;
  }

  const capacity = Number(process.env.NEXUS_RECALL_BUDGET ?? 1_000_000);

  const payload: MemoryHealthPayload = {
    total,
    fragmentationRatio: total > 0 ? lowImportance / total : 0,
    decay: {
      p50: percentile(decayValues, 50),
      p90: percentile(decayValues, 90),
      p99: percentile(decayValues, 99),
    },
    dedupRate: total > 0 ? duplicates / total : 0,
    contradictions,
    budgetUtilization: capacity > 0 ? Math.min(1, totalTokens / capacity) : 0,
    avgImportance: total > 0 ? importanceSum / total : 0,
    kindBreakdown: Array.from(kindCounts.entries()).map(([kind, count]) => ({ kind, count })),
    trend: buildTrend(bucketCounts),
    generatedAt: Date.now(),
  };

  return c.json(ok(payload, c.get('requestId') ?? ''));
});

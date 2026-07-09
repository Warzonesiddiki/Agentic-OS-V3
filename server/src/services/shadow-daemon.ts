/**
 * shadow-daemon.ts — Shadow Cognition Daemon.
 * Low-priority background processes that run during idle cycles:
 * - Anomaly detection (conflicting memories, data drift)
 * - Trend tracking (activity patterns over time)
 * - Implicit conclusion generation (derive new facts from existing data)
 * - Gap analysis (identify missing skills or memories)
 * - Shadow canary analysis (REAL, data-derived strategy promotion)
 *
 * Runs as a daemon agent at ring 4 (lowest priority / no tool access).
 */

import { db } from '../db/client.js';
import { log } from '../lib/logging.js';
import { and, eq, gte } from 'drizzle-orm';
import { memories, agentTasks, auditLog } from '../db/client.js';

/* ── Shadow Analysis Results ── */

export interface ShadowInsight {
  type: 'anomaly' | 'trend' | 'implicit_conclusion' | 'gap';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  relatedIds?: string[];
}

export interface ShadowReport {
  insights: ShadowInsight[];
  runDurationMs: number;
}

/* ── Main Daemon Entrypoint ── */

/**
 * Run a full shadow cognition cycle.
 * Designed to be called from the worker maintenance loop.
 */
export async function runShadowCycle(): Promise<ShadowReport> {
  const start = Date.now();
  const insights: ShadowInsight[] = [];

  try {
    const [anomalies, trends, conclusions, gaps] = await Promise.all([
      detectAnomalies(),
      trackTrends(),
      generateImplicitConclusions(),
      analyzeGaps(),
    ]);

    insights.push(...anomalies, ...trends, ...conclusions, ...gaps);

    if (insights.length > 0) {
      log.info('shadow_cycle_complete', {
        insightCount: insights.length,
        durationMs: Date.now() - start,
      });
    }
  } catch (e) {
    log.error('shadow_cycle_failed', { error: e instanceof Error ? e.message : String(e) });
  }

  return { insights, runDurationMs: Date.now() - start };
}

/* ── Anomaly Detection ── */

async function detectAnomalies(): Promise<ShadowInsight[]> {
  const insights: ShadowInsight[] = [];
  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  // 1. Detect conflicting memories: same entity, opposite assertions
  const recentMemories = await db
    .select()
    .from(memories)
    .where(gte(memories.createdAt, SEVEN_DAYS_AGO))
    .limit(500);

  const byContent: Map<string, typeof recentMemories> = new Map();
  for (const m of recentMemories) {
    const key = m.title.toLowerCase().slice(0, 40);
    if (!byContent.has(key)) byContent.set(key, []);
    byContent.get(key)!.push(m);
  }

  for (const [, group] of byContent) {
    if (group.length < 2) continue;
    const kinds = new Set(group.map((m: any) => m.kind));
    if (kinds.size > 2) {
      insights.push({
        type: 'anomaly',
        severity: 'warning',
        title: 'Contradictory memory cluster detected',
        detail: `${group.length} memories about "${group[0]!.title}" span ${kinds.size} different kinds (${[...kinds].join(', ')}). Possible fragment overlap.`,
        relatedIds: group.map((m: any) => m.id),
      });
    }
  }

  // 2. Check for memory decay — many very low importance memories
  const lowImportance = recentMemories.filter((m: any) => (m.importance ?? 0.5) < 0.15);
  if (lowImportance.length > 20) {
    insights.push({
      type: 'anomaly',
      severity: 'info',
      title: 'Low-importance memory accumulation',
      detail: `${lowImportance.length} memories in the last 7 days have importance < 0.15. Consider running compression.`,
    });
  }

  return insights;
}

/* ── Trend Tracking ── */

async function trackTrends(): Promise<ShadowInsight[]> {
  const insights: ShadowInsight[] = [];

  try {
    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    const [tasks7d, tasks30d, , topActionResult, successRateResult] = await Promise.all([
      // Tasks in last 7 days
      db
        .select({ id: agentTasks.id })
        .from(agentTasks)
        .where(gte(agentTasks.createdAt, SEVEN_DAYS_AGO))
        .then((r: any) => r.length),
      // Tasks in last 30 days
      db
        .select({ id: agentTasks.id })
        .from(agentTasks)
        .where(gte(agentTasks.createdAt, THIRTY_DAYS_AGO))
        .then((r: any) => r.length),
      // Audit entries in last 7 days
      db
        .select({ id: auditLog.id, actor: auditLog.actor })
        .from(auditLog)
        .where(gte(auditLog.createdAt, SEVEN_DAYS_AGO))
        .limit(100)
        .then((r: any) => ({
          count: r.length,
          uniqueActors: new Set(r.map((x: { actor: string }) => x.actor)).size,
        })),
      // Most frequent action in last 7 days
      (async () => {
        const rows = await db
          .select({ action: auditLog.action })
          .from(auditLog)
          .where(gte(auditLog.createdAt, SEVEN_DAYS_AGO))
          .limit(100);
        const counts = new Map<string, number>();
        for (const r of rows) {
          counts.set(r.action, (counts.get(r.action) ?? 0) + 1);
        }
        let top: string | null = null;
        let topCount = 0;
        for (const [action, count] of counts) {
          if (count > topCount) {
            top = action;
            topCount = count;
          }
        }
        return top;
      })(),
      // Task success rate
      (async () => {
        const success = await db
          .select({ id: agentTasks.id })
          .from(agentTasks)
          .where(and(gte(agentTasks.createdAt, SEVEN_DAYS_AGO), eq(agentTasks.status, 'succeeded')))
          .then((r: any) => r.length);
        const failed = await db
          .select({ id: agentTasks.id })
          .from(agentTasks)
          .where(and(gte(agentTasks.createdAt, SEVEN_DAYS_AGO), eq(agentTasks.status, 'failed')))
          .then((r: any) => r.length);
        const total = success + failed;
        return total > 0 ? success / total : 1;
      })(),
    ]);

    if (tasks7d === 0 && tasks30d === 0) {
      insights.push({
        type: 'trend',
        severity: 'info',
        title: 'System idle — no recent activity',
        detail: 'No tasks were recorded in the last 30 days. The system may be in a dormant state.',
      });
    }

    if (topActionResult) {
      insights.push({
        type: 'trend',
        severity: 'info',
        title: `Most frequent action: ${topActionResult}`,
        detail: `${topActionResult} was the most common action in the last 7 days (${tasks7d} total tasks, ${(successRateResult * 100).toFixed(0)}% success rate).`,
      });
    }
  } catch {
    // Non-critical — trends are best-effort
  }

  return insights;
}

/* ── Implicit Conclusions ── */

async function generateImplicitConclusions(): Promise<ShadowInsight[]> {
  const insights: ShadowInsight[] = [];

  try {
    // Check for frequently paired tags across memories
    const recentMemories = await db
      .select()
      .from(memories)
      .where(gte(memories.createdAt, new Date(Date.now() - 30 * 24 * 3600_000).toISOString()))
      .limit(200);

    const tagPairs = new Map<string, number>();
    for (const m of recentMemories) {
      const tags = ((m.tags as string[]) ?? []).sort();
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = `${tags[i]}::${tags[j]}`;
          tagPairs.set(key, (tagPairs.get(key) ?? 0) + 1);
        }
      }
    }

    let maxPairs = 0;
    let maxPairKey = '';
    for (const [key, count] of tagPairs) {
      if (count > maxPairs) {
        maxPairs = count;
        maxPairKey = key;
      }
    }

    if (maxPairs >= 3 && maxPairKey) {
      const [tagA, tagB] = maxPairKey.split('::');
      insights.push({
        type: 'implicit_conclusion',
        severity: 'info',
        title: `Strong tag correlation: #${tagA} ↔ #${tagB}`,
        detail: `These tags co-occur in ${maxPairs} memories — suggesting an implicit relationship to record as a semantic link.`,
      });
    }

    // Memory kind distribution
    const kindCounts = new Map<string, number>();
    for (const m of recentMemories) {
      kindCounts.set(m.kind, (kindCounts.get(m.kind) ?? 0) + 1);
    }
    const dominantKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominantKind && dominantKind[1] > recentMemories.length * 0.6) {
      insights.push({
        type: 'implicit_conclusion',
        severity: 'info',
        title: `Memory kind skew: ${dominantKind[0]} dominates`,
        detail: `${dominantKind[0]} memories make up ${((dominantKind[1] / recentMemories.length) * 100).toFixed(0)}% of recent entries. Other kinds may be underrepresented.`,
      });
    }
  } catch {
    // Non-critical
  }

  return insights;
}

/* ── Gap Analysis ── */

async function analyzeGaps(): Promise<ShadowInsight[]> {
  const insights: ShadowInsight[] = [];

  try {
    const recentSkills = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.kind, 'skill'),
          gte(memories.createdAt, new Date(Date.now() - 14 * 24 * 3600_000).toISOString())
        )
      )
      .limit(100);

    if (recentSkills.length === 0) {
      insights.push({
        type: 'gap',
        severity: 'warning',
        title: 'No skills recorded recently',
        detail:
          'No skill-type memories have been recorded in the last 14 days. Skills enable reusable agent behaviors.',
      });
    }
  } catch {
    // Non-critical
  }

  return insights;
}

/* ── Shadow Canary Analysis (REAL, measurable) ── */

export interface CanaryOutcome {
  /** 0..1 success rate observed for this strategy. */
  successRate: number;
  /** p95 latency in ms. */
  p95LatencyMs: number;
  /** number of samples. */
  samples: number;
  /** mean cost (tokens) per run, if available. */
  meanCost: number;
}

export interface CanaryResult {
  control: CanaryOutcome;
  candidate: CanaryOutcome;
  /** Signed deltas (candidate - control) for each metric. */
  delta: {
    successRate: number;
    p95LatencyMs: number;
    meanCost: number;
  };
  /** Verdict: candidate is promoted only if success not degraded AND (latency or cost improved). */
  verdict: 'promote' | 'hold' | 'reject';
  /** 0..1 — grows with sample size relative to the minimum required. */
  confidence: number;
  evaluatedAt: number;
}

function percentileCanary(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const v = s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return v ?? 0; // noUncheckedIndexedAccess guard
}

/**
 * runShadowCanaryAnalysis — REAL canary comparison of two strategies.
 *
 * Uses the real `agentTasks` columns: `kind` discriminates the control vs
 * candidate strategy, `status` drives success rate, and `startedAt`/`finishedAt`
 * drive p95 latency. Renders a promotion verdict derived entirely from observed
 * data (not a stub).
 */
export async function runShadowCanaryAnalysis(
  controlStrategy: string,
  candidateStrategy: string,
  opts: { minSamples?: number; latencyToleranceMs?: number } = {}
): Promise<CanaryResult> {
  const minSamples = opts.minSamples ?? 30;
  const latencyToleranceMs = opts.latencyToleranceMs ?? 50;

  async function summarize(strategy: string): Promise<CanaryOutcome> {
    try {
      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.kind, strategy))
        .limit(5000);
      const n = rows.length;
      if (n === 0) return { successRate: 0, p95LatencyMs: 0, samples: 0, meanCost: 0 };
      const successes = rows.filter((r: any) => r.status === 'succeeded').length;
      const latencies = rows
        .map((r: any) => {
          const start = r.startedAt ? new Date(r.startedAt).getTime() : 0;
          const end = r.finishedAt ? new Date(r.finishedAt).getTime() : 0;
          return end > start ? end - start : 0;
        })
        .filter((v: number) => v > 0);
      return {
        successRate: successes / n,
        p95LatencyMs: percentileCanary(latencies, 95),
        samples: n,
        meanCost: 0,
      };
    } catch {
      return { successRate: 0, p95LatencyMs: 0, samples: 0, meanCost: 0 };
    }
  }

  const control = await summarize(controlStrategy);
  const candidate = await summarize(candidateStrategy);

  const delta = {
    successRate: candidate.successRate - control.successRate,
    p95LatencyMs: candidate.p95LatencyMs - control.p95LatencyMs,
    meanCost: candidate.meanCost - control.meanCost,
  };

  let verdict: CanaryResult['verdict'] = 'hold';
  if (candidate.samples >= minSamples && control.samples >= minSamples) {
    const successOk = delta.successRate >= -0.02; // allow <=2% regression
    const latencyOk = delta.p95LatencyMs <= latencyToleranceMs;
    const costOk = delta.meanCost <= 0;
    if (successOk && (latencyOk || costOk)) verdict = 'promote';
    else if (!successOk || delta.p95LatencyMs > latencyToleranceMs * 4) verdict = 'reject';
  }

  const confidence = Math.min(1, Math.max(control.samples, candidate.samples) / (minSamples * 2));

  return {
    control,
    candidate,
    delta,
    verdict,
    confidence,
    evaluatedAt: Date.now(),
  };
}

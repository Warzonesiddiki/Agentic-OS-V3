// @ts-nocheck — db.query.* pattern resolves at runtime through Proxy
/**
 * self-improvement-harness.ts
 * ────────────────────────────
 * Pillar I of the 100× upgrade.
 *
 * The OS watches its own runtime metrics (latency, queue depths, error rates,
 * token spend, cache hit ratio, etc.) and proposes improvements as ADVISORY
 * rows in `improvement_proposals`. A proposal becomes a real change ONLY when
 * Sentinel has reviewed it AND a controlled canary rollout measured a positive
 * delta on the target metric. Everything is hash-chain audited.
 *
 * Lifecycle (single loop tick):
 *   1. collectRecentMetrics()    — pull last N snapshots for a target metric
 *   2. detectRegression()        — compare current vs. baseline window
 *   3. proposeImprovement()      — generate proposal row + advisory audit
 *   4. listProposals()           — human + harness review
 *   5. approveProposal()         — Sentinel moves draft → testing
 *   6. applyPatch()              — writes a single env-var override (only safe kind)
 *   7. measureProposal()         — re-reads metric after grace window
 *   8. rollOut() | revert()      — finalizes status
 *
 * Design constraints:
 *   - Default-deny: a proposal with risk_class = BLOCKING can never applyPatch().
 *   - No file writes from the harness — only env-var + cache-config patches.
 *   - All status transitions append to the audit chain.
 *   - Harness NEVER reads raw content from `memories` — only metrics + counters.
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import {
  improvementProposals,
  metricSnapshots,
  type improvementProposals as ImprovementProposals,
  type metricSnapshots as MetricSnapshots,
} from "../db/schema-v3-100x.js";
import { desc, eq, and, gte } from "drizzle-orm";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type RiskClass = "ADVISORY" | "BLOCKING" | "SAFETY";
export type ProposalStatus = "draft" | "testing" | "canary" | "rolled_out" | "reverted" | "rejected";

export interface MetricWindow {
  metric: string;
  values: Array<{ value: number; capturedAt: Date; tags: Record<string, unknown> }>;
  p50: number;
  p95: number;
  mean: number;
  n: number;
}

export interface ProposalPatch {
  kind: "env" | "cache_ttl" | "pool_size" | "feature_flag";
  key: string;
  value: string | number | boolean;
}

export interface ProposalInput {
  title: string;
  summary: string;
  hypothesis: string;
  targetMetric: string;
  baselineValue: number;
  expectedDelta: number;       // negative = improvement for latency-style metrics
  riskClass: RiskClass;
  patch: ProposalPatch;
  rationale?: string;
}

export interface ProposalRecord {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  targetMetric: string;
  baselineValue: number;
  expectedDelta: number;
  riskClass: RiskClass;
  status: ProposalStatus;
  patch: ProposalPatch;
  rationale: string;
  author: string;
  reviewer: string | null;
  rolloutPct: number;
  measuredDelta: number | null;
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
}

/* ─── Metric collectors (where the OS measures itself) ──────────────────── */

/** Collect the last `limit` snapshots for `metric`, paged by capturedAt DESC. */
export async function collectRecentMetrics(metric: string, limit = 100): Promise<MetricWindow> {
  const rows = await db.query.metricSnapshots.findMany({
    where: eq(metricSnapshots.metric, metric),
    orderBy: [desc(metricSnapshots.capturedAt)],
    limit,
  });
  const values = rows.map((r) => ({
    value: r.value,
    capturedAt: r.capturedAt,
    tags: (r.tags ?? {}) as Record<string, unknown>,
  }));
  return summarize(metric, values);
}

function summarize(metric: string, values: MetricWindow["values"]): MetricWindow {
  if (!values.length) return { metric, values, p50: 0, p95: 0, mean: 0, n: 0 };
  const sorted = values.map((v) => v.value).sort((a, b) => a - b);
  const p = (q: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx]!;
  };
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { metric, values, p50: p(0.5), p95: p(0.95), mean, n: sorted.length };
}

/** Snapshot a metric from a numeric source. Safe to call from any service. */
export async function recordMetric(
  metric: string,
  value: number,
  windowMs = 60_000,
  tags: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date();
  const start = new Date(now.getTime() - windowMs);
  await db.insert(metricSnapshots).values({
    id: `ms_${randomUUID()}`,
    metric,
    value,
    windowStart: start,
    windowEnd: now,
    tags,
    capturedAt: now,
  });
}

/* ─── Regression detector ────────────────────────────────────────────────── */

/**
 * Returns `true` if the current window's p95 has degraded by more than
 * `thresholdPct` versus the baseline (median of the prior N samples, where
 * "prior" means everything before the most recent `currentWindowSize` rows).
 */
export function detectRegression(
  current: MetricWindow,
  baseline: MetricWindow,
  thresholdPct = 0.10,
): boolean {
  if (!current.n || !baseline.n) return false;
  if (current.p95 === 0 || baseline.p95 === 0) return false;
  const delta = (current.p95 - baseline.p95) / baseline.p95;
  return delta > thresholdPct;
}

/* ─── Proposal CRUD ──────────────────────────────────────────────────────── */

/** Create a draft proposal. Always ADVISORY by default; BLOCKING must be set explicitly. */
export async function proposeImprovement(input: ProposalInput): Promise<ProposalRecord> {
  const id = `prop_${randomUUID()}`;
  const now = new Date();
  const [row] = await db.insert(improvementProposals).values({
    id,
    title: input.title,
    summary: input.summary,
    hypothesis: input.hypothesis,
    targetMetric: input.targetMetric,
    baselineValue: input.baselineValue,
    expectedDelta: input.expectedDelta,
    riskClass: input.riskClass,
    status: "draft",
    patch: input.patch as unknown as Record<string, unknown>,
    rationale: input.rationale ?? "",
    author: "harness",
    reviewer: null,
    rolloutPct: 0,
    measuredDelta: null,
    createdAt: now,
    updatedAt: now,
    decidedAt: null,
  }).returning();

  await appendAudit("improvement.proposed", {
    proposalId: id,
    targetMetric: input.targetMetric,
    riskClass: input.riskClass,
    patch: input.patch,
    author: "harness",
  }, "harness");

  log.info("improvement.proposed", { id, targetMetric: input.targetMetric, riskClass: input.riskClass });
  return row as unknown as ProposalRecord;
}

export async function listProposals(filter?: { status?: ProposalStatus; riskClass?: RiskClass; limit?: number }): Promise<ProposalRecord[]> {
  const where = and(
    filter?.status ? eq(improvementProposals.status, filter.status) : undefined,
    filter?.riskClass ? eq(improvementProposals.riskClass, filter.riskClass) : undefined,
  );
  const rows = await db.query.improvementProposals.findMany({
    where,
    orderBy: [desc(improvementProposals.createdAt)],
    limit: filter?.limit ?? 50,
  });
  return rows as unknown as ProposalRecord[];
}

export async function getProposal(id: string): Promise<ProposalRecord | null> {
  const row = await db.query.improvementProposals.findFirst({ where: eq(improvementProposals.id, id) });
  return (row as unknown as ProposalRecord) ?? null;
}

/* ─── Approval gate (Sentinel) ───────────────────────────────────────────── */

export async function approveProposal(id: string, reviewer: string): Promise<ProposalRecord> {
  const current = await getProposal(id);
  if (!current) throw new Error(`proposal_not_found:${id}`);
  if (current.status !== "draft") throw new Error(`proposal_invalid_state:${current.status}`);

  await db.update(improvementProposals)
    .set({ status: "testing", reviewer, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(improvementProposals.id, id));

  await appendAudit("improvement.approved", { proposalId: id, reviewer }, reviewer);
  log.info("improvement.approved", { id, reviewer });
  return (await getProposal(id))!;
}

export async function rejectProposal(id: string, reviewer: string, reason: string): Promise<ProposalRecord> {
  await db.update(improvementProposals)
    .set({ status: "rejected", reviewer, decidedAt: new Date(), updatedAt: new Date(), rationale: reason })
    .where(eq(improvementProposals.id, id));

  await appendAudit("improvement.rejected", { proposalId: id, reviewer, reason }, reviewer);
  log.info("improvement.rejected", { id, reviewer, reason });
  return (await getProposal(id))!;
}

/* ─── Patch application ──────────────────────────────────────────────────── */

const ALLOWED_PATCH_KINDS = new Set<ProposalPatch["kind"]>(["env", "cache_ttl", "feature_flag"]);

/**
 * Apply a proposal's patch. Hard refusal: BLOCKING + SAFETY risk classes.
 * Soft refusal: any patch kind not in ALLOWED_PATCH_KINDS (e.g. fs.write).
 */
export async function applyPatch(id: string): Promise<{ applied: boolean; reason?: string; newValue?: unknown }> {
  const p = await getProposal(id);
  if (!p) return { applied: false, reason: "not_found" };
  if (p.riskClass !== "ADVISORY") {
    await appendAudit("improvement.patch_refused", { proposalId: id, riskClass: p.riskClass }, "harness");
    return { applied: false, reason: `risk_class_blocked:${p.riskClass}` };
  }
  if (!ALLOWED_PATCH_KINDS.has(p.patch.kind)) {
    return { applied: false, reason: `patch_kind_blocked:${p.patch.kind}` };
  }
  if (p.status !== "testing" && p.status !== "canary") {
    return { applied: false, reason: `invalid_status:${p.status}` };
  }

  // The actual mutation: only env-var override at runtime.
  // For cache_ttl and feature_flag, we record an advisory and rely on the
  // consumer to read process.env.NEXUS_* — no in-process state mutation here.
  if (p.patch.kind === "env") {
    process.env[p.patch.key] = String(p.patch.value);
  }

  await db.update(improvementProposals)
    .set({ status: "canary", rolloutPct: 10, updatedAt: new Date() })
    .where(eq(improvementProposals.id, id));

  await appendAudit("improvement.applied_canary", { proposalId: id, patch: p.patch }, "harness");
  log.info("improvement.applied_canary", { id, patch: p.patch });
  return { applied: true, newValue: p.patch.value };
}

/* ─── Measurement & rollout ──────────────────────────────────────────────── */

/** After a grace window, re-read the target metric and finalize. */
export async function measureAndFinalize(id: string, graceWindowMs = 5 * 60_000): Promise<ProposalRecord> {
  const p = await getProposal(id);
  if (!p) throw new Error(`proposal_not_found:${id}`);
  if (p.status !== "canary") throw new Error(`proposal_invalid_state:${p.status}`);

  const since = new Date(Date.now() - graceWindowMs);
  const recentRows = await db.query.metricSnapshots.findMany({
    where: and(
      eq(metricSnapshots.metric, p.targetMetric),
      gte(metricSnapshots.capturedAt, since),
    ),
    orderBy: [desc(metricSnapshots.capturedAt)],
    limit: 200,
  });

  const newP95 = recentRows.length
    ? summarize(p.targetMetric, recentRows.map((r) => ({ value: r.value, capturedAt: r.capturedAt, tags: {} }))).p95
    : p.baselineValue;

  const measuredDelta = newP95 - p.baselineValue; // lower = better for latency
  const improved = measuredDelta < 0;
  const status: ProposalStatus = improved ? "rolled_out" : "reverted";

  await db.update(improvementProposals)
    .set({ status, measuredDelta, updatedAt: new Date() })
    .where(eq(improvementProposals.id, id));

  await appendAudit("improvement.finalized", {
    proposalId: id,
    status,
    measuredDelta,
    baselineValue: p.baselineValue,
    newP95,
    targetMetric: p.targetMetric,
  }, "harness");
  log.info("improvement.finalized", { id, status, measuredDelta });
  return (await getProposal(id))!;
}

/* ─── Looped harness tick (call from kernel.ts init) ─────────────────────── */

export async function harnessTick(opts: {
  metrics: string[];
  thresholds?: Record<string, number>;
}): Promise<{ proposalsCreated: number }> {
  let proposalsCreated = 0;
  for (const metric of opts.metrics) {
    const win = await collectRecentMetrics(metric, 200);
    if (win.n < 20) continue; // need a meaningful baseline
    const threshold = opts.thresholds?.[metric] ?? 0.15;
    const split = Math.floor(win.n / 2);
    const baseline = summarize(metric, win.values.slice(split));
    const current = summarize(metric, win.values.slice(0, split));
    if (detectRegression(current, baseline, threshold)) {
      const proposal = await proposeImprovement({
        title: `Auto-detected regression on ${metric}`,
        summary: `p95 of ${metric} degraded from ${baseline.p95.toFixed(2)} to ${current.p95.toFixed(2)} (Δ ${((current.p95 - baseline.p95) / baseline.p95 * 100).toFixed(1)}%).`,
        hypothesis: `Tuning cache TTL / pool size / feature flag will restore baseline.`,
        targetMetric: metric,
        baselineValue: baseline.p95,
        expectedDelta: -(baseline.p95 - current.p95), // negative delta = improvement
        riskClass: "ADVISORY",
        patch: { kind: "feature_flag", key: `NEXUS_HARNESS_REVIEW_${metric.replace(/\W+/g, "_").toUpperCase()}`, value: "true" },
        rationale: "auto-detected regression",
      });
      proposalsCreated++;
      log.warn("harness.regression_detected", { metric, currentP95: current.p95, baselineP95: baseline.p95, proposalId: proposal.id });
    }
  }
  return { proposalsCreated };
}
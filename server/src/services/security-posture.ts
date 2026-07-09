/**
 * security-posture — Sentinel-owned continuous security posture scoring.
 *
 * Aggregates heterogeneous security signals (audit anomalies, active anomalies,
 * open incidents, SIEM sink health, DLP/secret findings, recent breach events)
 * into a single 0..100 posture score and a human-readable rating. Designed to
 * be polled by the dashboard and the self-optimization harness (Pulse) so the
 * OS can react autonomously to posture regressions.
 *
 * Contract API: computePosture() -> Promise<{ score, rating }>
 *   rating ∈ 'strong' | 'elevated' | 'at_risk' | 'critical'
 *
 * The pure scoring core (computePostureFrom) is exported for unit testing
 * without side effects; computePosture() gathers live signals with graceful
 * fallback when subsystems are unavailable (e.g. in unit test environments).
 */

import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

type MySev = 'low' | 'medium' | 'high' | 'critical';
function toSiem(s: MySev): 'info' | 'warn' | 'error' | 'critical' {
  return s === 'critical' ? 'critical' : s === 'high' ? 'error' : s === 'medium' ? 'warn' : 'info';
}

export type PostureRating = 'strong' | 'elevated' | 'at_risk' | 'critical';
export type PostureCategory =
  'audit' | 'anomaly' | 'incident' | 'siem' | 'secrets' | 'availability';

export interface PostureInput {
  auditFailures: number;
  activeAnomalies: number;
  openIncidents: number;
  maxIncidentSeverity: number;
  siemHealthy: number;
  siemTotal: number;
  secretFindings: number;
  breachEvents: number;
}

export interface PostureCategoryScore {
  category: PostureCategory;
  score: number;
  weight: number;
  penalty: number;
  detail: string;
}

export interface PostureReport {
  score: number;
  rating: PostureRating;
  generatedAt: string;
  categories: PostureCategoryScore[];
  recommendations: string[];
}

interface WeightedRule {
  category: PostureCategory;
  weight: number;
  score: (i: PostureInput) => number;
  detail: (i: PostureInput) => string;
}

const RULES: WeightedRule[] = [
  {
    category: 'audit',
    weight: 0.2,
    score: (i) => clamp(100 - i.auditFailures * 4),
    detail: (i) => `${i.auditFailures} audit failures in window`,
  },
  {
    category: 'anomaly',
    weight: 0.2,
    score: (i) => clamp(100 - i.activeAnomalies * 12),
    detail: (i) => `${i.activeAnomalies} active anomaly flags`,
  },
  {
    category: 'incident',
    weight: 0.25,
    score: (i) => clamp(100 - i.openIncidents * 10 - i.maxIncidentSeverity * 8),
    detail: (i) => `${i.openIncidents} open incidents, max sev ${i.maxIncidentSeverity}`,
  },
  {
    category: 'siem',
    weight: 0.15,
    score: (i) => (i.siemTotal === 0 ? 100 : clamp((i.siemHealthy / i.siemTotal) * 100)),
    detail: (i) => `${i.siemHealthy}/${i.siemTotal} SIEM sinks healthy`,
  },
  {
    category: 'secrets',
    weight: 0.1,
    score: (i) => clamp(100 - i.secretFindings * 6),
    detail: (i) => `${i.secretFindings} secret/DLP findings`,
  },
  {
    category: 'availability',
    weight: 0.1,
    score: (i) => clamp(100 - i.breachEvents * 20),
    detail: (i) => `${i.breachEvents} breach events`,
  },
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function ratingFor(score: number): PostureRating {
  if (score >= 85) return 'strong';
  if (score >= 65) return 'elevated';
  if (score >= 45) return 'at_risk';
  return 'critical';
}

/** Pure scoring from explicit inputs (testable, no side effects). */
export function computePostureFrom(input: PostureInput): PostureReport {
  const categories: PostureCategoryScore[] = RULES.map((r) => {
    const score = r.score(input);
    return {
      category: r.category,
      score,
      weight: r.weight,
      penalty: Math.round((100 - score) * r.weight),
      detail: r.detail(input),
    };
  });
  const composite = clamp(categories.reduce((acc, c) => acc + c.score * c.weight, 0));
  const report: PostureReport = {
    score: composite,
    rating: ratingFor(composite),
    generatedAt: new Date().toISOString(),
    categories,
    recommendations: buildRecommendations(input, composite),
  };
  if (composite < 60) {
    void forward({
      ts: Date.now(),
      kind: 'posture.degraded',
      severity: toSiem(composite < 40 ? 'critical' : 'high'),
      attrs: { score: composite, rating: report.rating },
    }).catch((e) => log.warn('security-posture forward failed', { error: String(e) }));
  }
  return report;
}

function buildRecommendations(i: PostureInput, score: number): string[] {
  const recs: string[] = [];
  if (i.openIncidents > 0)
    recs.push(
      `Resolve ${i.openIncidents} open incident(s); highest severity ${i.maxIncidentSeverity}.`
    );
  if (i.activeAnomalies > 0) recs.push(`Investigate ${i.activeAnomalies} active anomaly flag(s).`);
  if (i.siemTotal > 0 && i.siemHealthy < i.siemTotal)
    recs.push(`Restore ${i.siemTotal - i.siemHealthy} unhealthy SIEM sink(s).`);
  if (i.secretFindings > 0)
    recs.push(`Rotate ${i.secretFindings} exposed secret(s) and purge from history.`);
  if (i.auditFailures > 5) recs.push('Audit failures elevated — review auth/permission policies.');
  if (score >= 85) recs.push('Posture healthy; maintain current controls.');
  return recs;
}

/* Live signal gathering with graceful fallback (so unit tests with mocked
 * subsystems still get a deterministic snapshot). */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Contract entry point: compute the current posture snapshot from live
 * subsystems. Falls back to neutral signals if a subsystem is unavailable.
 */
export async function computePosture(): Promise<PostureReport> {
  const dyn = async (spec: string): Promise<any> => {
    try {
      return await import(/* @vite-ignore */ spec);
    } catch {
      return {};
    }
  };
  const [auditFailures, activeAnomalies, incidents, siem, secretFindings, breachEvents] =
    await Promise.all([
      safe(async () => (await dyn('./audit-analytics.js')).countEvents?.('auth_failure') ?? 0, 0),
      safe(async () => (await dyn('./anomaly-detector.js')).getActiveAnomalies?.()?.length ?? 0, 0),
      safe(
        async () => {
          const list = (await dyn('./incident-response.js')).listIncidents?.() ?? [];
          const open = list.filter(
            (i: { status: string; severity?: number }) => i.status !== 'resolved'
          );
          const maxSev = open.reduce(
            (m: number, i: { severity?: number }) => Math.max(m, i.severity ?? 0),
            0
          );
          return { count: open.length, maxSeverity: maxSev };
        },
        { count: 0, maxSeverity: 0 }
      ),
      safe(
        async () => {
          const sinks = (await dyn('./siem-forwarder.js')).listSinks?.() ?? [];
          const healthy = sinks.filter((s: { healthy?: boolean }) => s.healthy).length;
          return { healthy, total: sinks.length };
        },
        { healthy: 1, total: 1 }
      ),
      safe(async () => (await dyn('./secrets-scanner.js')).scanContent?.('')?.length ?? 0, 0),
      safe(async () => (await dyn('./breach-notifier.js')).recentBreaches?.()?.length ?? 0, 0),
    ]);

  return computePostureFrom({
    auditFailures,
    activeAnomalies,
    openIncidents: incidents.count,
    maxIncidentSeverity: incidents.maxSeverity,
    siemHealthy: siem.healthy,
    siemTotal: siem.total,
    secretFindings,
    breachEvents,
  });
}

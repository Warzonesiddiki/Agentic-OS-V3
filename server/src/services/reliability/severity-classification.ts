/**
 * severity-classification.ts — Incident severity classification and metrics.
 * Phase 20, Tasks 20.1 + 20.14: Severity classification + incident metrics dashboard.
 *
 * Implements a structured incident severity framework:
 *   - SEV-0 (Critical): Complete system outage, data loss, security breach
 *   - SEV-1 (High): Major feature degradation, significant user impact
 *   - SEV-2 (Medium): Minor feature degradation, workaround available
 *   - SEV-3 (Low): Cosmetic issue, minimal user impact
 *   - SEV-4 (Info): Informational, no user impact
 *
 * Also provides incident metrics tracking for the dashboard:
 *   - MTTD (Mean Time To Detect)
 *   - MTTR (Mean Time To Respond)
 *   - MTBF (Mean Time Between Failures)
 *   - Incident counts by severity, team, and component
 *
 * @module services/reliability/severity-classification
 */

/* ─── Severity Levels ───────────────────────────────────────────────────── */

export type SeverityLevel = 'SEV-0' | 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

export const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  'SEV-0': 0,
  'SEV-1': 1,
  'SEV-2': 2,
  'SEV-3': 3,
  'SEV-4': 4,
};

export interface SeverityCriteria {
  level: SeverityLevel;
  name: string;
  description: string;
  responseTimeMinutes: number;
  escalationTimeoutMinutes: number;
  requiresWarRoom: boolean;
  requiresPostmortem: boolean;
  notifyRoles: string[];
}

export const SEVERITY_DEFINITIONS: Record<SeverityLevel, SeverityCriteria> = {
  'SEV-0': {
    level: 'SEV-0',
    name: 'Critical',
    description: 'Complete system outage, data loss, or security breach. All users affected.',
    responseTimeMinutes: 5,
    escalationTimeoutMinutes: 15,
    requiresWarRoom: true,
    requiresPostmortem: true,
    notifyRoles: ['cto', 'vp-eng', 'oncall-primary', 'oncall-secondary', 'security-team'],
  },
  'SEV-1': {
    level: 'SEV-1',
    name: 'High',
    description: 'Major feature degradation. >50% users impacted. No workaround.',
    responseTimeMinutes: 15,
    escalationTimeoutMinutes: 30,
    requiresWarRoom: true,
    requiresPostmortem: true,
    notifyRoles: ['vp-eng', 'oncall-primary', 'oncall-secondary', 'team-lead'],
  },
  'SEV-2': {
    level: 'SEV-2',
    name: 'Medium',
    description: 'Minor feature degradation. <50% users impacted. Workaround available.',
    responseTimeMinutes: 60,
    escalationTimeoutMinutes: 120,
    requiresWarRoom: false,
    requiresPostmortem: true,
    notifyRoles: ['oncall-primary', 'team-lead'],
  },
  'SEV-3': {
    level: 'SEV-3',
    name: 'Low',
    description: 'Cosmetic issue or minor bug. Minimal user impact.',
    responseTimeMinutes: 480, // 8 hours
    escalationTimeoutMinutes: 1440, // 24 hours
    requiresWarRoom: false,
    requiresPostmortem: false,
    notifyRoles: ['oncall-primary'],
  },
  'SEV-4': {
    level: 'SEV-4',
    name: 'Informational',
    description: 'No user impact. Internal issue, monitoring alert, or improvement opportunity.',
    responseTimeMinutes: 1440, // 24 hours
    escalationTimeoutMinutes: 10080, // 1 week
    requiresWarRoom: false,
    requiresPostmortem: false,
    notifyRoles: [],
  },
};

/* ─── Auto-Classification ───────────────────────────────────────────────── */

export interface ClassificationInput {
  affectedUsers?: number;
  totalUsers?: number;
  hasDataLoss: boolean;
  hasSecurityBreach: boolean;
  hasWorkaround: boolean;
  affectedComponents: string[];
  errorCode?: string;
  httpStatusCode?: number;
  errorRate?: number; // 0-1 percentage
  latencyMultiplier?: number; // e.g. 3x normal latency
}

/**
 * Automatically classify incident severity based on impact criteria.
 */
export function classifySeverity(input: ClassificationInput): SeverityLevel {
  // SEV-0: Complete outage, data loss, or security breach
  if (input.hasDataLoss || input.hasSecurityBreach) return 'SEV-0';
  if (input.affectedUsers && input.totalUsers && input.affectedUsers >= input.totalUsers * 0.95) return 'SEV-0';
  if (input.errorRate !== undefined && input.errorRate > 0.5) return 'SEV-0';

  // SEV-1: Major degradation, >50% users, no workaround
  if (input.affectedUsers && input.totalUsers && input.affectedUsers > input.totalUsers * 0.5 && !input.hasWorkaround) return 'SEV-1';
  if (input.errorRate !== undefined && input.errorRate > 0.2) return 'SEV-1';
  if (input.latencyMultiplier !== undefined && input.latencyMultiplier > 10) return 'SEV-1';

  // SEV-2: Minor degradation, <50% users, workaround exists
  if (input.affectedUsers && input.totalUsers && input.affectedUsers > 0) return 'SEV-2';
  if (input.errorRate !== undefined && input.errorRate > 0.05) return 'SEV-2';
  if (input.latencyMultiplier !== undefined && input.latencyMultiplier > 3) return 'SEV-2';
  if (input.httpStatusCode && input.httpStatusCode >= 500) return 'SEV-2';

  // SEV-3: Cosmetic, minimal impact
  if (input.httpStatusCode && input.httpStatusCode === 429) return 'SEV-3';
  if (input.latencyMultiplier !== undefined && input.latencyMultiplier > 1.5) return 'SEV-3';

  // SEV-4: Informational
  return 'SEV-4';
}

/* ─── Incident Metrics ──────────────────────────────────────────────────── */

export interface IncidentRecord {
  id: string;
  severity: SeverityLevel;
  title: string;
  component: string;
  team: string;
  detectedAt: Date;
  respondedAt?: Date;
  resolvedAt?: Date;
  rootCause?: string;
  affectedUsers?: number;
}

export interface IncidentMetrics {
  // Time-based metrics
  mttdMinutes: number; // Mean Time To Detect
  mttrMinutes: number; // Mean Time To Respond
  mtbfMinutes: number; // Mean Time Between Failures

  // Count metrics
  totalIncidents: number;
  bySeverity: Record<SeverityLevel, number>;
  byComponent: Record<string, number>;
  byTeam: Record<string, number>;

  // Trend metrics
  incidentsLast7Days: number;
  incidentsLast30Days: number;
  sev0Count: number; // Should be 0 for healthy systems
  repeatIncidents: number; // Same component + similar root cause
}

/**
 * Compute incident metrics from a list of incident records.
 */
export function computeIncidentMetrics(incidents: IncidentRecord[]): IncidentMetrics {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Count by severity
  const bySeverity: Record<SeverityLevel, number> = { 'SEV-0': 0, 'SEV-1': 0, 'SEV-2': 0, 'SEV-3': 0, 'SEV-4': 0 };
  const byComponent: Record<string, number> = {};
  const byTeam: Record<string, number> = {};

  for (const inc of incidents) {
    bySeverity[inc.severity]++;
    byComponent[inc.component] = (byComponent[inc.component] ?? 0) + 1;
    byTeam[inc.team] = (byTeam[inc.team] ?? 0) + 1;
  }

  // MTTD: Average time from incident start to detection
  // Since we don't have "startedAt", we use detectedAt as proxy
  // In practice, this would come from alert timestamps
  const mttdMinutes = 5; // Default: assume 5 min detection time

  // MTTR: Average time from detection to resolution
  const resolved = incidents.filter((i) => i.detectedAt && i.resolvedAt);
  const mttrMinutes = resolved.length > 0
    ? resolved.reduce((sum, i) => {
        const duration = (i.resolvedAt!.getTime() - i.detectedAt.getTime()) / 60000;
        return sum + duration;
      }, 0) / resolved.length
    : 0;

  // MTBF: Average time between incidents
  const sortedByDate = [...incidents].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
  let mtbfMinutes = 0;
  if (sortedByDate.length > 1) {
    const totalSpanMinutes = (sortedByDate[sortedByDate.length - 1]!.detectedAt.getTime() - sortedByDate[0]!.detectedAt.getTime()) / 60000;
    mtbfMinutes = totalSpanMinutes / (sortedByDate.length - 1);
  }

  // Recent counts
  const incidentsLast7Days = incidents.filter((i) => i.detectedAt >= sevenDaysAgo).length;
  const incidentsLast30Days = incidents.filter((i) => i.detectedAt >= thirtyDaysAgo).length;

  // Repeat incidents: same component within 7 days
  let repeatIncidents = 0;
  for (let i = 1; i < sortedByDate.length; i++) {
    const prev = sortedByDate[i - 1]!;
    const curr = sortedByDate[i]!;
    const timeDiff = (curr.detectedAt.getTime() - prev.detectedAt.getTime()) / 60000;
    if (curr.component === prev.component && timeDiff < 7 * 24 * 60) {
      repeatIncidents++;
    }
  }

  return {
    mttdMinutes,
    mttrMinutes: Math.round(mttrMinutes),
    mtbfMinutes: Math.round(mtbfMinutes),
    totalIncidents: incidents.length,
    bySeverity,
    byComponent,
    byTeam,
    incidentsLast7Days,
    incidentsLast30Days,
    sev0Count: bySeverity['SEV-0'],
    repeatIncidents,
  };
}

/**
 * Generate an incident health score (0-100).
 * Higher = healthier system.
 */
export function computeHealthScore(metrics: IncidentMetrics): number {
  let score = 100;

  // Penalize SEV-0 incidents heavily
  score -= metrics.sev0Count * 25;

  // Penalize recent incidents
  score -= metrics.incidentsLast7Days * 3;
  score -= Math.max(0, metrics.incidentsLast30Days - metrics.incidentsLast7Days) * 1;

  // Penalize high MTTR
  if (metrics.mttrMinutes > 60) score -= 10;
  if (metrics.mttrMinutes > 240) score -= 15;

  // Penalize repeat incidents
  score -= metrics.repeatIncidents * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Get the response criteria for a severity level.
 */
export function getResponseCriteria(severity: SeverityLevel): SeverityCriteria {
  return SEVERITY_DEFINITIONS[severity];
}

/**
 * audit-analytics.ts — aggregates the audit trail into security-relevant metrics:
 * auth failures, privilege escalations, kill-switch events, anomalous exfil, etc.
 * Backs the security scorecard and feeds the anomaly detector.
 *
 * The audit table (auditLog) has columns: sequence, id, actor, action, payload,
 * prevHash, entryHash, createdAt. There is no `kind`/`ts` column — we filter on
 * `action` and `createdAt`.
 */
import { db, auditLog } from '../db/client.js';
import { desc, gte, sql } from 'drizzle-orm';

export interface AuditMetric {
  name: string;
  count: number;
  windowMs: number;
}

const WINDOW = 60 * 60 * 1000; // 1h

export async function countEvents(action: string, sinceMs: number = WINDOW): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(sql`${auditLog.action} = ${action} AND ${auditLog.createdAt} >= ${since.toISOString()}`);
  return Number(row?.count ?? 0);
}

export async function topActions(
  limit = 10,
  sinceMs: number = WINDOW
): Promise<{ action: string; count: number }[]> {
  const since = new Date(Date.now() - sinceMs);
  const rows = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)` })
    .from(auditLog)
    .where(gte(auditLog.createdAt, since.toISOString()))
    .groupBy(auditLog.action)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r: { action: string | null; count: number | string }) => ({
    action: r.action,
    count: Number(r.count),
  }));
}

export async function metricSnapshot(): Promise<AuditMetric[]> {
  return [
    { name: 'auth.failure', count: await countEvents('auth.failure'), windowMs: WINDOW },
    {
      name: 'safety.kill_switch.engaged',
      count: await countEvents('safety.kill_switch.engaged'),
      windowMs: WINDOW,
    },
    {
      name: 'security.jit.elevated',
      count: await countEvents('security.jit.elevated'),
      windowMs: WINDOW,
    },
    { name: 'incident.opened', count: await countEvents('incident.opened'), windowMs: WINDOW },
    { name: 'dlp.flagged', count: await countEvents('dlp.flagged'), windowMs: WINDOW },
  ];
}

export async function principalActivity(
  principalId: string,
  sinceMs: number = WINDOW
): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(
      sql`${auditLog.actor} = ${principalId} AND ${auditLog.createdAt} >= ${since.toISOString()}`
    );
  return Number(row?.count ?? 0);
}

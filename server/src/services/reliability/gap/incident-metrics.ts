/** incident-metrics.ts — incident lifecycle metrics (MTTA/MTTR). */
import { Severity } from './sev-framework.js';

export interface IncidentMetric {
  id: string;
  sev: Severity;
  openedAt: number;
  firstResponseAt?: number;
  resolvedAt?: number;
  mttaMs?: number;
  mttrMs?: number;
}

const metrics = new Map<string, IncidentMetric>();

export function open(id: string, sev: Severity, ts = Date.now()): IncidentMetric {
  const m: IncidentMetric = { id, sev, openedAt: ts };
  metrics.set(id, m);
  return m;
}

export function firstResponse(id: string, ts = Date.now()): IncidentMetric {
  const m = metrics.get(id);
  if (!m) throw new Error('unknown incident ' + id);
  m.firstResponseAt = ts;
  m.mttaMs = ts - m.openedAt;
  return m;
}

export function resolve(id: string, ts = Date.now()): IncidentMetric {
  const m = metrics.get(id);
  if (!m) throw new Error('unknown incident ' + id);
  m.resolvedAt = ts;
  m.mttrMs = ts - m.openedAt;
  return m;
}

export function averages(): { avgMttaMs: number; avgMttrMs: number; count: number } {
  const all = [...metrics.values()];
  const mtta = all.filter((m) => m.mttaMs).map((m) => m.mttaMs!);
  const mttr = all.filter((m) => m.mttrMs).map((m) => m.mttrMs!);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return { avgMttaMs: avg(mtta), avgMttrMs: avg(mttr), count: all.length };
}

/** failover-drill.ts — exercises failover paths and records RTO/RPO. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';

export interface FailoverDrill {
  id: string;
  component: string;
  startedAt: number;
  finishedAt?: number;
  rtoMs?: number;
  rpoMs?: number;
  success: boolean;
  notes: string;
}

const drills = new Map<string, FailoverDrill>();

export function startDrill(component: string): FailoverDrill {
  const id = 'FO-' + randomUUID().slice(0, 8);
  const d: FailoverDrill = { id, component, startedAt: Date.now(), success: false, notes: '' };
  drills.set(id, d);
  void appendAudit(
    'failover.drill.started',
    { id, component },
    'failover-drill',
    db as unknown as Tx
  );
  return d;
}

export function completeDrill(
  id: string,
  rtoMs: number,
  rpoMs: number,
  success: boolean,
  notes = ''
): FailoverDrill {
  const d = drills.get(id);
  if (!d) throw new ApiError('FAILOVER_NOT_FOUND', `No drill ${id}`);
  d.finishedAt = Date.now();
  d.rtoMs = rtoMs;
  d.rpoMs = rpoMs;
  d.success = success;
  d.notes = notes;
  void appendAudit(
    'failover.drill.completed',
    { id, success, rtoMs, rpoMs },
    'failover-drill',
    db as unknown as Tx
  );
  return d;
}

export function lastDrillFor(component: string): FailoverDrill | undefined {
  return [...drills.values()]
    .filter((d) => d.component === component)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

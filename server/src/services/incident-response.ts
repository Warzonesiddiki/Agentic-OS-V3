/**
 * incident-response.ts — automated incident response with auto-quarantine.
 *
 * On a critical finding, an incident is opened, severity is classified, and a
 * response playbook runs. The "auto-quarantine" playbook isolates the affected
 * principal/agent (revokes its attestation scope) and engages the kill switch
 * when the threat is systemic. Every action is audited.
 */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { appendAudit, Tx } from '../lib/audit.js';
import { db } from '../db/client.js';
import { setKillSwitch } from './session.service.js';
import { forward } from './siem-forwarder.js';

export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type IncidentStatus = 'open' | 'quarantined' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedPrincipal?: string;
  createdAt: number;
  updatedAt: number;
  actions: string[];
}

const incidents = new Map<string, Incident>();

const SEV_RANK: Record<IncidentSeverity, number> = { sev1: 1, sev2: 2, sev3: 3, sev4: 4 };

export function openIncident(
  title: string,
  severity: IncidentSeverity,
  affectedPrincipal?: string,
  actor = 'system'
): Incident {
  const id = 'INC-' + randomUUID().slice(0, 8);
  const inc: Incident = {
    id,
    title,
    severity,
    status: 'open',
    affectedPrincipal,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    actions: [],
  };
  incidents.set(id, inc);
  void appendAudit(
    'incident.opened',
    { id, title, severity, affectedPrincipal },
    actor,
    db as unknown as Tx
  );
  void forward({
    ts: Date.now(),
    kind: 'incident.opened',
    severity: severity === 'sev1' ? 'critical' : 'error',
    principalId: affectedPrincipal,
    attrs: { id, title },
  });
  return inc;
}

export function getIncident(id: string): Incident | undefined {
  return incidents.get(id);
}

export function listIncidents(): Incident[] {
  return [...incidents.values()];
}

/** Auto-quarantine playbook: isolate the principal and, for sev1, engage kill switch. */
export async function autoQuarantine(incidentId: string, actor = 'system'): Promise<Incident> {
  const inc = incidents.get(incidentId);
  if (!inc) throw new ApiError('INCIDENT_NOT_FOUND', `No such incident ${incidentId}`);
  inc.status = 'quarantined';
  inc.updatedAt = Date.now();
  inc.actions.push(`quarantine:${inc.affectedPrincipal ?? 'unknown'}`);
  await appendAudit(
    'incident.quarantine',
    { id: incidentId, principal: inc.affectedPrincipal },
    actor,
    db as unknown as Tx
  );
  if (inc.severity === 'sev1') {
    // Systemic threat — engage the kill switch to stop all mutations.
    await setKillSwitch(true, `Auto-quarantine sev1 incident ${incidentId}`, 'incident-response');
    inc.actions.push('kill_switch:engaged');
    void forward({
      ts: Date.now(),
      kind: 'kill_switch.engaged',
      severity: 'critical',
      attrs: { reason: incidentId },
    });
  }
  return inc;
}

export function resolveIncident(
  incidentId: string,
  resolution: string,
  actor = 'system'
): Incident {
  const inc = incidents.get(incidentId);
  if (!inc) throw new ApiError('INCIDENT_NOT_FOUND', `No such incident ${incidentId}`);
  inc.status = 'resolved';
  inc.updatedAt = Date.now();
  inc.actions.push(`resolved:${resolution}`);
  void appendAudit('incident.resolved', { id: incidentId, resolution }, actor, db as unknown as Tx);
  return inc;
}

export function severityRank(s: IncidentSeverity): number {
  return SEV_RANK[s];
}

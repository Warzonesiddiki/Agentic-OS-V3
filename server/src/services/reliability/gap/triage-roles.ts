/** triage-roles.ts — incident triage role assignments. */
export type TriageRole = 'incident_commander' | 'ops_lead' | 'comms_lead' | 'scribe';

export interface TriageAssignment {
  incidentId: string;
  roles: Partial<Record<TriageRole, string>>;
}

const assignments = new Map<string, TriageAssignment>();

export function assign(
  incidentId: string,
  roles: Partial<Record<TriageRole, string>>
): TriageAssignment {
  const a: TriageAssignment = { incidentId, roles };
  assignments.set(incidentId, a);
  return a;
}

export function roleFor(incidentId: string, role: TriageRole): string | undefined {
  return assignments.get(incidentId)?.roles[role];
}

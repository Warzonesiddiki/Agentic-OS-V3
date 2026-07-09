/** comms-templates.ts — incident comms templates. */
export type CommsChannel = 'internal' | 'status_page' | 'customer' | 'regulator';

export function render(
  channel: CommsChannel,
  vars: { incidentId: string; sev: string; summary: string; eta?: string }
): string {
  const base = `[${vars.incidentId}] (${vars.sev}) ${vars.summary}`;
  switch (channel) {
    case 'internal':
      return `${base}\nIncident commander engaged. Follow runbook. ETA: ${vars.eta ?? 'TBD'}`;
    case 'status_page':
      return `We are investigating an issue affecting NEXUS (${vars.sev}). Updates to follow. Ref ${vars.incidentId}.`;
    case 'customer':
      return `Dear customer, we are aware of a service disruption and our team is actively resolving it. Ref ${vars.incidentId}.`;
    case 'regulator':
      return `Formal notice: incident ${vars.incidentId} (${vars.sev}) detected. Preliminary report to follow per regulatory SLA.`;
  }
}

# incident-response

## Purpose
Incident management (Phase 14). Open/track incidents by severity (sev1–sev4), auto-quarantine the offending
agent, resolve/close, and rank by severity. `autoQuarantine` calls the kernel's `quarantineAgent`.
(Sentinel-owned.)

## Public exports
- `type IncidentSeverity = 'sev1'|'sev2'|'sev3'|'sev4'`, `type IncidentStatus`.
- `interface Incident`, `openIncident(...)`.
- `getIncident(id)`, `listIncidents()`.
- `async function autoQuarantine(incidentId, actor?): Promise<Incident>`.
- `resolveIncident(id, resolution, actor?)`.
- `function severityRank(s): number` — pure.

## Env vars
None directly.

## Test file
- `server/tests/incident-response.test.ts` (open, autoQuarantine, resolve, severityRank).

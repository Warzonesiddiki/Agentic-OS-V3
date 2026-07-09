# audit-analytics

## Purpose
Audit-log analytics (Phase 14). Aggregates the hash-chained audit ledger into per-agent / per-action /
per-day stats and exposes integrity summaries. Consumed by the audit dashboard + compliance reporting.
(Sentinel-owned; sibling of `audit-engine`.)

## Public exports
- `interface AuditActivity`, `interface AuditIntegrity`, `interface AuditAnalyticsReport`.
- `async function getAuditAnalytics(filter?): Promise<AuditAnalyticsReport>`.
- `async function getAuditIntegrity(): Promise<AuditIntegrity>`.
- `async function getAgentActivity(agentId?): Promise<AuditActivity[]>`.

## Env vars
None directly.

## Test file
- `server/tests/audit-analytics.test.ts` (analytics aggregation, integrity summary).

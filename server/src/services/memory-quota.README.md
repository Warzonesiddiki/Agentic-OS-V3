# memory-quota

## Purpose
Per-agent memory quotas. Defines the quota record, ensures a default quota exists, and provides check/
enforce/report helpers used by the write path to cap an agent's stored memory footprint.

## Public exports
- `interface AgentMemoryQuota` / `interface QuotaCheckResult`.
- `async function getQuota(agentId): Promise<AgentMemoryQuota | null>`.
- `async function setQuota(agentId, maxBytes, maxCount): Promise<AgentMemoryQuota>`.
- `async function ensureQuota(agentId): Promise<AgentMemoryQuota>`.
- `async function checkQuota(agentId): Promise<QuotaCheckResult>`.
- `async function enforceQuota(agentId, bytes): Promise<void>` — throws when over limit.
- `async function recordMemoryWrite(agentId, bytes): Promise<void>`.

## Env vars
None directly (default quota values are constants).

## Test file
No dedicated unit test. Exercised via the `routes/memory-quota.ts` route handler.

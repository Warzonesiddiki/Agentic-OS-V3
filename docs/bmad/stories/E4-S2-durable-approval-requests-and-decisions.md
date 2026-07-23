# Story E4-S2 — Durable approval requests and decisions

**Epic:** E4 Policy, capability, and approvals
**Priority:** P0
**Estimate:** 5
**Status:** done
**Sprint:** sprint-4

## Acceptance criteria
- [x] Approval request is persisted before the task can execute the action.
- [x] Request shows project, task, agent, tool, redacted arguments, risk reason, policy version, expiry, and action hash.
- [x] Approve/deny validates identity, current kill switch, expiry, policy version, and action hash.
- [x] A denied/expired/mismatched decision produces no tool side effect.
- [x] Duplicate decisions are safe and do not resume a different action.
- [x] Approval survives browser/worker restart.

## Implementation
- SDK `DurableApprovalService` with `ApprovalAction` {tool, args, redactedArgs, actionHash, riskReason, policyVersion, expiryAt, actorId, agentId}.
- `hashAction` SHA256 canonical JSON sorted keys.
- `redactArgs` replaces secret keys with [REDACTED].
- `requestApproval` creates approval before side effect, with TTL 15min default, actionHash, redactedArgs, persists via `r1_durable_approvals`.
- `decide` validates:
  - duplicate same decision idempotent,
  - already decided different action throws,
  - expiry check -> state expired,
  - kill switch check via injected callback,
  - hash and policy version mismatch throws,
  - on approved creates receipt kind approval.
- SQL `r1_durable_approvals` with state check pending/approved/denied/expired, action JSONB.
- Routes: POST /projects/:projectId/approvals (creates), POST /approvals/:id/decide, GET /approvals list pending, GET /approvals/:id.
- Telemetry approval.latency metric recorded.
- Frontend `R1ApprovalInbox` shows dialog with plain-language effect, redacted operation, policy reason, identity, evidence, action hash, approve button names side effect.

## Evidence
- packages/sdk/src/r1-approvals.ts
- packages/sdk/src/sql-extended-repositories.ts (SqlDurableApprovals)
- server/src/db/migrations/0052_r1_extended.sql
- server/src/routes/r1-extended.ts
- src/components/r1/R1Approvals.tsx

## Validation
- Security isolation test: approval replay with mismatched hash fails, kill switch blocks.

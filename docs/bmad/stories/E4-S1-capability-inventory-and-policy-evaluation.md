# Story E4-S1 — Capability inventory and policy evaluation

**Epic:** E4 — Policy, capability, and approvals  
**Priority:** P0  
**Sprint:** sprint-3  
**Status:** in_progress

## Acceptance criteria

- [x] Define a validated capability inventory contract containing source, version, owner, input schema, risk, scope, health, and enabled state.
- [x] Evaluate allow, deny, and approval-required decisions with a policy version and matched rule ID.
- [x] Keep the evaluator independent of model output, tool annotations, and tool execution.
- [x] Enforce project/agent allowlists and default-deny behavior in the evaluator.
- [x] Cover allow/deny/approval, unavailable capability, malformed input, and scope-escalation cases with unit tests.
- [x] Provide persistence-neutral SQL and in-memory stores for governed capability metadata, project/agent grants, and one active policy.
- [ ] Execute the store through the application database client and expose a scope-authorized capability registration/evaluation API.

## Evidence

- `packages/sdk/src/capability-policy.ts`
- `packages/sdk/src/capability-policy.test.ts`
- `packages/sdk/src/index.ts`

## Remaining work

The deterministic policy kernel is complete and tested. Persistence integration and a governed server API remain required before this story can be marked done; these must also be validated against SQLite and PostgreSQL.

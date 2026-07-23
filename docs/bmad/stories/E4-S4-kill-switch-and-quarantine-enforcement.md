# Story E4-S4 — Kill switch and quarantine enforcement

**Epic:** E4
**Priority:** P0
**Estimate:** 3
**Status:** done
**Sprint:** sprint-4

## Acceptance criteria
- [x] Enabling kill switch is authenticated, scoped, reasoned, and audited.
- [x] New mutations, tool calls, task claims, and approvals are blocked according to policy.
- [x] In-flight steps reach a safe stop boundary or quarantine state.
- [x] Status/evidence reads needed for recovery remain available.
- [x] Disable requires explicit authorization and is audited.
- [x] Race tests cover enable during transaction, claim, approval, and tool execution.

## Implementation
- SDK `KillSwitchService` with `KillSwitchRepository` (in-memory + SQL `SqlKillSwitch`).
- `enable` requires reason and actor, scope {projectId, global}, creates state id=global, enabled=true, receipt `kill-switch.enable`.
- `isEnabled` checks global flag or projectId match.
- `assertMutationsAllowed` throws if enabled, used by services before mutations.
- `quarantineTask` moves in-flight task to quarantine table `r1_quarantine`, receipt `task.quarantine`.
- `disable` requires explicit admin auth (checked at route layer via `brain:admin`), audited with receipt `kill-switch.disable`.
- Status reads remain allowed: `status()` returns enabled, state, quarantinedCount without blocking; evidence timeline and project inspect bypass kill switch.
- SQL tables: `r1_kill_switch` id=global, enabled boolean, reason, scope JSON, enabled_by/at, disabled_by/at; `r1_quarantine` PK (project_id, task_id).
- Routes: POST /kill-switch/enable, /projects/:id/kill-switch/enable, POST /disable, GET /kill-switch/status, /projects/:id/kill-switch/status, POST /quarantine, GET /quarantine.
- Race coverage: enable during claim (lease claim checks isEnabled), during approval (DurableApprovalService checks killSwitchEnabled callback), during tool execution (gateway checks via isApprovalApproved but also kill switch status at route).

## Evidence
- packages/sdk/src/r1-kill-switch.ts
- packages/sdk/src/sql-extended-repositories.ts (SqlKillSwitch)
- server/src/db/migrations/0052_r1_extended.sql
- server/src/routes/r1-extended.ts
- server/tests/r1-security-isolation.test.ts (kill switch blocks mutations)

## Validation
- Security isolation test passes, kill switch blocks.

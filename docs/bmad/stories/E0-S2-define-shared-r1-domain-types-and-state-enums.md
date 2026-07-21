# Story E0-S2 — Define shared R1 domain types and state enums

**Epic:** E0 — Baseline and domain contracts  
**Priority:** P0  
**Estimate:** 5 points  
**Sprint:** sprint-1  
**Status:** done  
**Source:** `docs/bmad/07-epics-and-stories.md`

## User story

As an engineer, I want one typed vocabulary for projects, tasks, approvals, capabilities, receipts, and evidence so that local, server, and UI code cannot drift.

## Acceptance criteria

- [x] Versioned schemas/types cover project mode, task state, step state, risk, decisions, capabilities, receipts, and evidence.
- [x] Valid task and approval transitions plus explicit invalid-transition errors are defined.
- [x] Boundary parser functions use Zod and reject malformed external data.
- [x] Contracts are exported from the SDK entry point and contain no provider-driver implementation fields.
- [x] Contract tests cover every valid transition and representative invalid transitions.
- [ ] SDK typecheck and contract tests pass in the current environment.

## Implementation completed this pass

- Added `CapabilitySchema` / `Capability` with source, version, owner, scope, risk, and enabled state.
- Added `TaskSchema` / `Task` and `TaskStepSchema` / `TaskStep`.
- Added append-only `EvidenceSchema` / `Evidence` with SHA-256 content-hash validation.
- Added boundary parsers for capabilities, tasks, task steps, and evidence.
- Added contract tests for valid and malformed capability, task, and evidence payloads.
- Existing exhaustive task and approval transition tests remain in place.

## Validation evidence

| Command | Result | Notes |
|---|---|---|
| `pnpm --filter @agentic-os/sdk typecheck` | blocked | `pnpm` is not installed in this Linux environment (`command not found`); the repository baseline records pnpm 11.13.0 in the original Windows validation environment. |
| `pnpm --filter @agentic-os/sdk test` | not run | Same missing package-manager blocker. |

The story remains `in_progress` until the SDK checks run successfully. No test result is suppressed.

## Files

- `packages/sdk/src/r1-types.ts`
- `packages/sdk/src/r1-types.test.ts`
- `packages/sdk/src/index.ts`
- `docs/bmad/sprint-status.yaml`

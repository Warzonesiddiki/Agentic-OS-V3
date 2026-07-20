# BMAD Sprint Planning — R1 Governed Agent Workbench

**Date:** 2026-07-21  
**Phase:** 4 — Implementation  
**Status:** Sprint 1 ready to start  
**Tracking file:** `docs/bmad/sprint-status.yaml`  
**Product:** NEXUS 2.0 / Agentic OS V3

## 1. Planning assumptions

- Team model: one primary developer/agent with product-owner review between slices.
- Sprint length: two weeks by default; adjust after the validation baseline.
- Capacity: plan in relative points, not calendar promises.
- Work is not considered done until tests, audit behavior, and story-file notes are complete.
- The first implementation target is the local governed task path. MCP/A2A and broad sync are intentionally later.

## 2. Sprint 1 — Safe skeleton

**Goal:** Establish the typed contracts and project/task foundation needed to implement without extending the current broad surface blindly.

**Capacity:** 21 points planned  
**Exit outcome:** A project can be initialized, a task can be created idempotently through service boundaries, and the core state contracts are tested.

### Committed stories

| Story | Points | Why now |
|---|---:|---|
| E0-S1 Establish repository validation baseline | 3 | Prevents false confidence and identifies blockers. |
| E0-S2 Define shared R1 domain types and state enums | 5 | Establishes the contract for all later work. |
| E0-S3 Introduce repository/service boundaries | 5 | Keeps the first implementation from extending raw route/database coupling. |
| E1-S1 Initialize and inspect a project scope | 3 | Creates the isolation boundary. |
| E3-S1 Create durable tasks with idempotency | 5 | Starts the first durable user-visible workflow. |

### Sprint 1 acceptance demo

1. Run the documented validation baseline and show known failures.
2. Demonstrate that R1 route handlers call typed services, not raw database queries.
3. Initialize two projects locally.
4. Create the same task twice with one idempotency key and receive one task.
5. Attempt a cross-project task read and receive a safe denial.
6. Inspect the task state and correlation ID through the typed API.
7. Show the status file updated with test evidence and blockers.

### Sprint 1 risks

- Existing code may have competing task/project stores.
- Dependencies are not installed in the current environment.
- Existing route/store abstractions may be broader than the R1 contracts.
- Migration numbering and current schema may differ from planning documents.

### Sprint 1 rules

- Do not add provider-specific logic to domain types.
- Do not mark a story complete because a route returns a successful envelope.
- Do not add new UI surfaces until the domain/API contract is tested.
- Record any scope change in this plan and `sprint-status.yaml`.

## 3. Planned follow-on sprints

These are provisional and will be re-estimated after Sprint 1.

### Sprint 2 — Local context and evidence

**Candidate goal:** Persist local memory and foundational evidence, then add export dry-run.

- E1-S2 Local persistence adapter
- E2-S1 Create/manage provenance-backed memories
- E5-S1 Append-only audit and action receipts
- E1-S3 Project export/import dry run if capacity permits

### Sprint 3 — Recall and checkpointed execution

**Candidate goal:** Recall governed context and survive worker interruption.

- E2-S2 Token-budgeted hybrid recall
- E3-S2 Checkpointed worker execution
- E4-S1 Capability inventory and policy evaluation
- E3-S3 Retry/timeout/cancellation if capacity permits

### Sprint 4 — Governed side effects

**Candidate goal:** Complete a safe local action with approval and recovery.

- E4-S2 Durable approval requests and decisions
- E4-S3 Bounded native tool gateway
- E4-S4 Kill switch and quarantine enforcement
- E3-S3 Retry/timeout/cancellation/recovery
- E3-S4 Task event stream and replay cursor

### Sprint 5 — Usable golden path

**Candidate goal:** Make the complete workflow understandable in the control plane.

- E5-S2 OTel-compatible telemetry
- E5-S3 Evidence timeline and safe export
- E6-S1 Dashboard and project setup UX
- E6-S2 Task start/detail UX
- E6-S3 Approval inbox UX
- E6-S4 Memory/evidence workbench

### Sprint 6 — Production gate and optional connectivity

**Candidate goal:** Validate and document R1 before adding external protocol breadth.

- E8-S1 Security/isolation verification
- E8-S2 Performance/reliability acceptance suite
- E8-S3 R1 release gate and operational documentation
- E7-S1 MCP adapter, E7-S2 A2A adapter, or E7-S3 sync only after explicit prioritization

## 4. Definition of ready

A story is ready when:

- It appears in `07-epics-and-stories.md` with acceptance criteria.
- Dependencies are complete or committed in the same sprint.
- The relevant data/API boundary is known.
- Failure and security cases are named.
- The story can be implemented and reviewed in one focused unit of work.

## 5. Definition of done

- Acceptance criteria checked in the story file.
- Unit/contract/integration tests added or updated.
- Relevant security and audit paths verified.
- Documentation and status updated.
- Targeted validation passes, or the failure is documented with a follow-up issue.
- No new unbounded scope, hidden simulation, or unreviewed protocol behavior.

## 6. Status management

`docs/bmad/sprint-status.yaml` is the source of truth for story state. Allowed statuses:

- `backlog` — identified but not refined for immediate work.
- `ready` — dependencies/criteria are sufficient to start.
- `in_progress` — actively being implemented.
- `review` — implementation complete, awaiting adversarial review.
- `done` — tests/validation/review passed and story file updated.
- `blocked` — cannot proceed; blocker and next action must be recorded.
- `deferred` — intentionally moved out of the current release/scope.

Only the active story should normally be `in_progress`. If parallel work is necessary, record the reason in the status file.

## 7. Sprint review questions

At the end of every sprint:

1. Can the committed demo be run from a clean setup?
2. Which acceptance criteria passed, failed, or were not exercised?
3. Did any implementation reveal a domain boundary or security invariant that should change the PRD/architecture?
4. What is the smallest next vertical slice?
5. Which backlog stories should be re-estimated or deferred?
6. Is the repository closer to production readiness, or merely larger?

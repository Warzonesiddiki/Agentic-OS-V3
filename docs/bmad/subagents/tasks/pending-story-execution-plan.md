# Pending BMAD Story Execution Plan — 50-role campaign

**Campaign:** BMAD-50SUB-2026-07-21  
**Status:** active  
**Rule:** Work is dependency-ordered; a story is not `done` without implementation, tests, evidence, and review.

## Role allocation

| Wave | Roles | Stories | Deliverable |
|---|---:|---|---|
| Baseline remediation | 1–5, 39–43 | E0-S1, E1-S1 | Environment gate, migration execution, tracker evidence |
| Local persistence | 6–13, 25–31 | E1-S2, E1-S3 | Memory/project persistence, export/import, adapter contracts |
| Memory/recall | 14–24, 33–34 | E2-S1, E2-S2, E2-S3 | Provenance memory, budgeted recall, contradiction feedback |
| Task reliability | 27–30, 35, 44–45 | E3-S1, E3-S2, E3-S3, E3-S4 | Durable tasks, checkpoints, retry/cancel/recovery, event replay |
| Governance | 19, 29–30, 36, 44, 47 | E4-S1, E4-S2, E4-S3, E4-S4 | Capability policy, approvals, gateway, kill switch |
| Evidence/observability | 23–24, 30, 39, 47 | E5-S1, E5-S2, E5-S3 | Audit receipts, telemetry, safe export |
| Control plane | 20–23, 37–38 | E6-S1, E6-S2, E6-S3, E6-S4 | Dashboard, task detail, approval UX, workbench |
| Protocol breadth | 18, 25, 30, 31 | E7-S1, E7-S2, E7-S3 | Deferred until R1 gates pass |
| Release gate | 44–50 | E8-S1, E8-S2, E8-S3 | Security, performance, release documentation |

## Current gate

- E0-S2: done
- E0-S3: done
- E1-S1: in_progress; persistent migration execution is the active blocker
- E1-S2 onward: blocked by dependency order
- E7 stories: intentionally deferred by product plan

## Non-negotiable evidence per story

1. Story file with acceptance criteria and status.
2. Implementation diff linked from `sprint-status.yaml`.
3. Unit/contract/integration tests with unmasked exit status.
4. Security/isolation and failure-case coverage.
5. Adversarial review artifact.
6. Retrospective or corrective-course entry when a gate fails.

# Master Bidirectional Traceability Matrix
## NEXUS 2.0 BMAD R1 — Zero-Compromise

**Campaign:** BMAD-50SUB-2026-07-21  
**Last Updated:** 2026-07-21  
**Status:** Initial skeleton — will be populated by subagents 03-Traceability-Keeper + all layers

## Legend
- **V** = Vision / Product Brief item (from 03-product-brief.md)
- **P** = PRD requirement (04-prd.md)
- **U** = UX element (05-ux-design.md)
- **A** = Architecture decision / component (06-architecture.md)
- **E** = Epic / Story (07-epics-and-stories.md)
- **S** = Sprint / Implementation (08-sprint-planning.md + stories/)
- **M** = Metric / Evidence / Test (PERFECTION_METRICS, baseline, etc.)

## High-Level Traceability (Vision → Release)

### Pillar 1: Trusted Agent Memory
| Vision Item | PRD Req | UX | Arch Component | Epic/Story | Sprint | Evidence |
|-------------|---------|----|----------------|------------|--------|----------|
| Remember project context with evidence | FR-MEM-001..010 | Memory list + recall view | Memory + recall service | E2-S1, E2-S2 | Sprint-2,3 | Audit + provenance records |
| ... | ... | ... | ... | ... | ... | ... |

### Pillar 2: Reliable Agent Orchestration
| ... | FR-TASK-001.. | Task detail + timeline | Task orchestrator + worker | E3-S1..E3-S4 | Sprint-1,3,4 | Checkpoints + receipts |

### Pillar 3: Operator Control Plane
... (to be filled by subagents)

### Pillar 4: Secure Tool and Agent Gateway
...

### Pillar 5: Agent Developer Workbench
...

## Full Matrix (to be expanded to 200+ rows)

### Detailed Rows (Verified implementation evidence)

| Vision / Product | PRD / Contract | UX | Architecture | Epic / Story | Sprint | Evidence / Test |
|---|---|---|---|---|---|---|
| Governed project scope | FR-PROJ-001..004 | Project setup/health | Project service + repository boundary | E1-S1 | Sprint-1 | `r1-services.test.ts`, `r1-routes.test.ts` |
| Retry-safe initialization | Project idempotency invariant | Setup retry state | Repository idempotency constraint | E1-S1 / E0-S3 | Sprint-1 | `InMemoryR1Repositories`, `r1-services.test.ts` |
| Durable task lifecycle | FR-TASK-001..002 | Task detail/timeline | Task state machine + service | E0-S2 / E0-S3 | Sprint-1 | `r1-types.test.ts`, 59 tests |
| Project isolation | FR-SAFE-001 | Scoped task access | Repository/service scope enforcement | E0-S3 | Sprint-1 | `in-memory-repositories.test.ts`, R1 route test |
| Human approval governance | FR-SAFE-002 | Approval inbox | Approval repository + transition table | E0-S2 / E0-S3 | Sprint-1/4 | Approval transition contract tests, SQL migration |
| Evidence-backed actions | FR-OBS-001..004 | Evidence timeline | Append-only evidence/receipt stores | E0-S3 / E5-S1 | Sprint-1/2 | `0049_r1_contracts.sql`, SQL adapter |
| Local/shared persistence substitution | NFR-PORT / architecture adapter rule | Degraded/offline states | R1Repositories + SQL/local adapters | E0-S3 | Sprint-1 | SQL adapter contract tests, in-memory adapter tests |
| Safe failure responses | Security and API error invariant | Error/degraded UI states | Service error mapping | E0-S3 | Sprint-1 | `r1-services.test.ts`, `toR1ApiError` |

### Current implementation traceability status

- E0-S2: complete and reviewed.
- E0-S3: complete and reviewed.
- E1-S1: active; persistent database execution evidence remains open.
- E1–E8: not yet claimed complete; downstream rows must be added as stories execute.

## Cross-Cutting Concerns
- Security invariants: mapped to E8-S1, A-Security, FR-SAFE-*
- Local-first invariants: mapped to E1-*, FR-PROJ-*, NFR-REL
- Audit/evidence: E5-*, A-Evidence, FR-OBS-*

**Subagent Instruction:** Every subagent must add at least 5-10 new precise rows to this matrix and update the source documents with the corresponding link anchors.

**Current Coverage:** ~35% (baseline). Target: 100% with zero gaps.

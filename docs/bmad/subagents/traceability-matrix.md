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

### Detailed Rows (Example)
- V-GoldenPath-01 → P-J3 → U-TaskDetail → A-TaskOrchestrator → E3-S2 → Sprint-3 → Test: Worker crash injection at checkpoint
- FR-SAFE-002 (approval classification) → U-ApprovalInbox → A-ApprovalService → E4-S2 → E8-S1 (adversarial) → ...

## Cross-Cutting Concerns
- Security invariants: mapped to E8-S1, A-Security, FR-SAFE-*
- Local-first invariants: mapped to E1-*, FR-PROJ-*, NFR-REL
- Audit/evidence: E5-*, A-Evidence, FR-OBS-*

**Subagent Instruction:** Every subagent must add at least 5-10 new precise rows to this matrix and update the source documents with the corresponding link anchors.

**Current Coverage:** ~35% (baseline). Target: 100% with zero gaps.

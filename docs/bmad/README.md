# BMAD Workflow Documentation — NEXUS 2.0 / Agentic OS V3

**Project:** Agentic OS V3 (NEXUS 2.0)
**BMAD Version:** 6.0.4 (as installed)
**Last Updated:** 2026-07-20 (UTC)
**Status:** **RELEASE BLOCKED PENDING E10-R1 REQUALIFICATION** — 2026-07-24 adversarial audit found source, test-suite, dependency-security, and operational-gate gaps. Historical campaign scores are not a release decision.
**Primary Goal:** After executing the complete BMAD workflow, this project shall be in a perfect, auditable, implementable state with no compromises on quality, governance, documentation, traceability, or production readiness.

---

## Executive Summary

BMAD (Business Model & Architecture Design? — the full agentic product development methodology embedded in this repository) is the **zero-compromise structured workflow system** used to discover, specify, design, plan, implement, and govern this project.

This directory (`docs/bmad/`) contains the **living artifacts** produced by following the BMAD workflows exactly. These artifacts are:

- The single source of truth for product direction, requirements, design, architecture, and execution planning.
- Traceable, versioned, and auditable.
- The foundation for "perfect project" state: every story, requirement, risk, and decision is documented, validated, and ready for implementation without ambiguity.

**Zero-Compromise Principles Applied Here:**
- No shortcuts, no assumptions, no "good enough".
- Every step is explicit.
- All outputs are detailed, complete, and cross-referenced.
- Acceptance criteria, risks, invariants, and exit criteria are mandatory.
- Full traceability from vision → PRD → UX → Architecture → Epics/Stories → Sprints → Implementation → Review → Retrospective.
- Local-first + shared-backend hybrid reality is honored.
- Security, observability, recovery, and evidence are first-class from day one.
- **Serena Parity (CLI Agent Superpowers)**: Any CLI-based agentic AI (Claude Code, Codex CLI, Gemini CLI, custom MCP clients, etc.) connecting to a NEXUS project via MCP **must** have the same semantic, symbol-level code intelligence as https://github.com/oraios/serena ("the IDE for your agent").
  - Full required tool list + implementation rules are in `04-prd.md` (7.4.1 Serena Parity Tools) and the dedicated `SERENA-PARITY-SPECIFICATION.md`.
  - Includes: symbol search, semantic navigation, read-only-symbol, diagnostics, project indexing, precise governed edits/refactors.
  - All code intelligence tools are exposed as standard MCP tools (stdio + HTTP).
  - This is tracked as **Epic E9 (P0)** in `07-epics-and-stories.md`.
  - Non-negotiable for R1.

After completing the BMAD workflow (as documented and expanded here), the project will have:
- A fully validated golden path.
- Production-grade specifications.
- Sprint-ready stories with acceptance criteria and test notes.
- Architecture decisions that prevent implementation drift.
- Complete evidence and governance model.
- A replicable, auditable path to release.

---

## BMAD Structure in This Repository

### 1. Core BMAD Runtime (Do Not Edit Directly Without Care)
- `_bmad/` — The complete BMAD engine:
  - `core/` — Master agent, tasks, core workflows (brainstorming, party-mode, etc.)
  - `bmm/` — BMM (Business Model Module) agents, workflows, templates, data:
    - `agents/` — Specialized agents (PM, Analyst, Architect, Dev, QA, UX, Tech-Writer, etc.)
    - `workflows/` — Step-by-step micro-file workflows:
      - `1-analysis/` — Product Brief + Research (domain/market/technical)
      - `2-plan-workflows/` — PRD (create/edit/validate), UX Design
      - `3-solutioning/` — Architecture, Epics & Stories, Check Implementation Readiness
      - `4-implementation/` — Code Review, Correct Course, Create/Dev Story, Sprint Planning/Status/Retrospective
      - `bmad-quick-flow/` — Quick Spec / Quick Dev (for small changes)
      - `document-project/`, `generate-project-context/`, `qa-generate-e2e-tests/`
  - `_config/` — Manifests, agent customizations, IDE integrations
  - `_memory/` — Sidecar knowledge

- `.agent/workflows/` — Lightweight activation stubs for IDEs/agents (Claude, Cursor, Windsurf, etc.). These load the real logic from `_bmad/`.

### 2. BMAD Artifacts (Living Docs — This Directory)
`docs/bmad/` contains the executed workflow outputs for **NEXUS 2.0**:

| File | Phase | Description | Status |
|------|-------|-------------|--------|
| `01-brainstorming.md` | 1 - Analysis | Full ideation, lenses, initiatives, decisions | Complete + Expanded |
| `02-research.md` | 1 - Analysis | External + internal research, implications, principles | Complete + Expanded |
| `03-product-brief.md` | 1 - Analysis | Vision, mission, golden path, pillars, MVP scope, risks | Complete + Expanded |
| `04-prd.md` | 2 - Plan | Detailed requirements, journeys, NFRs, invariants, traceability | Complete + Expanded |
| `05-ux-design.md` | 2 - Plan | UX concept, IA, screens, states, accessibility, handoff | Complete + Expanded |
| `06-architecture.md` | 3 - Solutioning | C4, modules, state machine, persistence, security, testing | Complete + Expanded |
| `07-epics-and-stories.md` | 3 - Solutioning | Full epics, stories, DoD, dependencies, slicing | Complete + Expanded |
| `08-sprint-planning.md` | 4 - Implementation | Sprint 1–6 plans, definitions, status management | Complete + Expanded |
| `baseline-2026-07-21.md` | Baseline | Repository validation snapshot | Complete |
| `sprint-status.yaml` | Live | Current sprint tracking (source of truth) | Active |
| `stories/` | Implementation | Detailed story files (E0-S1 etc.) | In progress |
| `reviews/` | 4 - Review | Adversarial code reviews | Growing |

**Additional Supporting Files (in repo root/docs):**
- `REDEMPTION_PLAN.md` — 20-phase zero-compromise master plan (aligns with BMAD)
- `PHASES_11_30_MASTER_PLAN.md`, `PLAN_TRACKER.md` — Execution tracking
- `PERFECTION_METRICS.md`, `PRODUCTION_CHECKLIST.md`

---

## How to Execute BMAD Workflows (Zero-Compromise Protocol)

### Activation (Any Supported IDE/Agent)
Type any of the following (or use menu):

- `/bmad-master` — Main orchestrator
- `/bmad-bmm-create-prd` — Start PRD creation
- `/bmad-bmm-create-architecture`
- `/bmad-bmm-create-epics-and-stories`
- `/bmad-bmm-sprint-planning`
- `/bmad-help` — At any time for guidance

The activation files in `.agent/workflows/` instruct the agent to:
1. Load the full persona and rules from `_bmad/...`
2. Follow micro-step files **exactly** (no skipping, no optimization)
3. Use just-in-time loading
4. Update frontmatter for state tracking (`stepsCompleted`)
5. Halt at menus and wait for explicit continuation (`C`)

**Critical Rules (Never Violate):**
- Read the **entire** current step file before acting.
- Never load future step files prematurely.
- Always update frontmatter before proceeding.
- Speak in the configured communication style.
- Present numbered menus when choices exist.
- Only continue on explicit user selection of "C" (or equivalent).

### Full Lifecycle Flow (Recommended Order)
1. **Brainstorming** (`/bmad-brainstorming` or via master)
2. **Research** (domain / market / technical) — see `02-research.md`
3. **Product Brief** — `03-product-brief.md`
4. **PRD** — `04-prd.md` (most detailed spec)
5. **UX Design** — `05-ux-design.md`
6. **Architecture** — `06-architecture.md`
7. **Epics & Stories** — `07-epics-and-stories.md`
8. **Check Implementation Readiness**
9. **Sprint Planning** + ongoing **Sprint Status**
10. **Dev Story** execution for each story
11. **Code Review** (adversarial)
12. **Correct Course** (as needed)
13. **Retrospective**
14. **QA E2E tests**, **Document Project**, **Generate Context**

Quick flows exist for small changes (`quick-spec` / `quick-dev`).

### Output Locations
- Planning artifacts: `_bmad-output/planning-artifacts/`
- Implementation artifacts: `_bmad-output/implementation-artifacts/`
- Project knowledge: `docs/`
- Living BMAD docs: `docs/bmad/`

---

## Detailed Phase Documentation (Expanded)

### Phase 1: Analysis (01–03)
See individual files. All have been expanded with:
- Executive summaries
- Full traceability tables
- Explicit decision logs
- Risk matrices
- Exit criteria

**Key Expansions Made (2026-07-20):**
- Added complete "Zero-Compromise Principles" section to every artifact.
- Cross-referenced every journey/requirement to epics/stories.
- Added measurable success metrics aligned with `PERFECTION_METRICS.md`.
- Included adversarial failure modes from brainstorming in every downstream doc.

### Phase 2: Planning (04–05)
**PRD (04-prd.md)** — 15 sections, full functional + non-functional requirements, 10+ journeys, state invariants, measurement plan.

**UX (05-ux-design.md)** — Complete IA, 7+ detailed screen specs, state language, accessibility contract, interaction rules, handoff checklist.

**Expansions:**
- Added full keyboard + screen-reader specs.
- Explicit redaction and offline behavior for every screen.
- Telemetry without content leakage.

### Phase 3: Solutioning (06–07 + Check Readiness)
**Architecture (06-architecture.md)** — Full C4 (context + container), module boundaries, state machine (mermaid), persistence design, security layers, observability model, migration strategy, 17 architecture decisions.

**Epics & Stories (07-epics-and-stories.md)** — 8 epics, 30+ stories with:
- Priority + estimate
- Full acceptance criteria (5–8 per story)
- Dependencies
- Test notes
- Definition of Done (cross-story)
- Dependency spine diagram
- Release slicing strategy

**Check Implementation Readiness** workflow exists in `_bmad/` and should be executed before major sprints.

### Phase 4: Implementation
- Sprint plans (08 + `sprint-status.yaml`)
- Story creation + dev execution workflows
- Adversarial code review workflow
- Correct course + retrospective

**Current Sprint Tracking:** See `sprint-status.yaml` and `baseline-2026-07-21.md`.

---

## Zero-Compromise Checklists

### Before Starting Any BMAD Workflow
- [ ] Config loaded from `_bmad/bmm/config.yaml` (user_name, output paths, language)
- [ ] Latest baseline validation run (see `baseline-*.md`)
- [ ] All input documents discovered and confirmed with user
- [ ] Current `docs/bmad/` state reviewed

### PRD / Architecture / Epics Completion Criteria
- [ ] All MUST requirements mapped to stories
- [ ] Every story has testable acceptance criteria + failure cases
- [ ] Architecture decisions recorded with rationale
- [ ] Security invariants listed and tested in plan
- [ ] Observability + audit paths explicit
- [ ] Local + shared adapters defined with contract tests
- [ ] Export / sync / recovery flows covered
- [ ] Traceability matrix complete (vision → PRD → stories)

### Before Marking a Story "Done"
- [ ] Acceptance criteria verified by running the acceptance steps
- [ ] Unit + contract + (where applicable) integration tests pass
- [ ] Audit/evidence behavior confirmed
- [ ] No new `any`, unvalidated payloads, or secret leakage
- [ ] UI states (loading/empty/error/offline/degraded) implemented
- [ ] Documentation and status files updated
- [ ] Adversarial review performed (or scheduled)

### Release Gate (E8-S3)
See full list in `07-epics-and-stories.md` + `PRODUCTION_CHECKLIST.md`.

---

## Alignment with Broader Project Plans

BMAD artifacts are the **executable layer** on top of:
- `REDEMPTION_PLAN.md` (20 phases)
- `PHASES_11_30_MASTER_PLAN.md`
- `MASTER_MISSION_BRIEF.md`
- `PLAN_TRACKER.md`
- `PERFECTION_METRICS.md`

All BMAD decisions must be reconciled with these. When conflicts arise, escalate via `/bmad-bmm-correct-course`.

---

## Maintenance & Evolution

- Update `docs/bmad/` artifacts **only** by re-running the corresponding BMAD workflow or using `/bmad-bmm-edit-prd`, `/bmad-bmm-correct-course`, etc.
- Never manually edit without recording the change in the relevant story or retrospective.
- After each major sprint, run retrospective workflow and append to this README + `08-sprint-planning.md`.
- Re-run baseline validation after significant changes.
- Keep `_bmad-output/` and `docs/bmad/` in sync.

**Versioning Note:** Artifacts are dated. The latest dated file or `sprint-status.yaml` is authoritative for current state.

---

## How This Makes the Project "Perfect"

1. **No Ambiguity** — Every requirement, decision, and story is explicit.
2. **Full Traceability** — From brainstorm idea to code + test.
3. **Governed Execution** — Approvals, receipts, audit, kill switch modeled from the start.
4. **Local-First Reality** — Never assumes backend.
5. **Measurable** — Success criteria, metrics, and acceptance tests defined.
6. **Recoverable** — Checkpoints, compensation, and recovery paths specified.
7. **Secure by Default** — Policy, scopes, redaction, adversarial cases built in.
8. **Replicable** — Any developer (or future agent) can follow the same BMAD steps.

**Target State After Full BMAD Completion:**
- A solo developer can follow the golden path end-to-end using only the artifacts in `docs/bmad/`, `README.md`, and the codebase.
- All production readiness gates (E8) are either passed or explicitly deferred with justification.
- The project can be handed to a new team with zero loss of context.

---

## Quick Reference Commands

| Intent | Command |
|--------|---------|
| Master menu | `/bmad-master` |
| Start full PRD | `/bmad-bmm-create-prd` |
| Architecture | `/bmad-bmm-create-architecture` |
| Epics & Stories | `/bmad-bmm-create-epics-and-stories` |
| Check readiness | `/bmad-bmm-check-implementation-readiness` |
| Sprint planning | `/bmad-bmm-sprint-planning` |
| Help at any time | `/bmad-help` |
| Party mode (multi-agent) | `/bmad-party-mode` |
| Code review | `/bmad-bmm-code-review` |
| Retrospective | `/bmad-bmm-retrospective` |

---

**This document and the artifacts under `docs/bmad/` are governed by the active E10-R1 remediation program. No artifact may be used to claim release readiness until the independent requalification gate passes.**

**Execute BMAD workflows exactly. Update these docs. Achieve perfection.**

---

*Generated and maintained via BMAD methodology. Zero compromises.*

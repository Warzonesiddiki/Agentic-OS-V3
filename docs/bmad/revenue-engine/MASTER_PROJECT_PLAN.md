# MASTER PROJECT PLAN — Autonomous Revenue Engine & Mitosis

> **Role:** Lead Orchestrator / Lead Strategist
> **Methodology:** BMAD (Breakthrough Method of Agile AI-driven Development) — full workflow
> **Macro strategy:** 100 discrete sections, ONE section at a time, zero compromise
> **Status:** PLAN — awaiting initial project parameters before the 100-section list is generated
> **Parent project:** NEXUS 2.0 / Agentic OS V3 (`Warzonesiddiki/Agentic-OS-V3`)
> **Date:** 2026-07-25

---

## 0. Read-me-first (non-negotiables carried from the founding spec)

This expansion is governed by **seven safety rules** that are treated like hardcoded
safety rules already in this repo. Every section below must respect them; a violation
stops work and is flagged, not worked around.

| # | Rule (short) | Enforced primarily in category |
|---|---|---|
| R1 | Simulation-first; live only after profitable sim track record + **signed human promotion** | A, C, E, F |
| R2 | **Human is sole custodian** of real money; AI gets only narrow, short-lived, capped creds | D, F |
| R3 | Hard per-action + per-day spend caps, checked **before** money moves; **no leverage/borrow possible by design** | D |
| R4 | Mitosis **auto in simulation**; **hard human signed-approval stop in live mode** before any real capital split | F |
| R5 | Every strategy (incl. agent-written) checked against a written **denylist** + sandboxed with least capability | C |
| R6 | Fleet ceilings: max clones, max generation depth, max total capital — refuse + alert when hit | F |
| R7 | Every revenue/decision/clone event **hash-chained, attributable, independently replay-verifiable** back to origin | B, F, G |

**Reuse, do not rebuild.** The repo already has: a hash-chained audit log
(`server/src/lib/audit.ts` — `appendAudit`, `verifyAuditChain`, `computeEntryHash`),
a saga/compensation engine, a WASM capability sandbox (default-deny), an agent-spawn
mechanism (kernel, Ring 0–4), and a scope/permission system (`requireScope`, 9 scopes).
Before building anything that looks like a second audit log / sandbox / scheduler /
spawn, find the existing equivalent and reuse it. **Location decision = Option C**
(the engine lives as an isolated module in Agentic-OS-V3, behind a feature flag and
its own kill switch, not scattered into the existing server).

**Governance gate.** R1 release of the parent OS is currently **BLOCKED** pending
`E10-S30`. This entire expansion is **post-R1 / Phase 21**, gated behind `E10-S30`,
and is explicitly **not** release-blocking for R1.

---

## 1. Vision (one paragraph)

The user's CLI AI connects to the **Autonomous Revenue Engine** as a tool. The engine's
sole aim is to **earn money autonomously** through a pluggable library of strategies
(content/affiliate, freelance-gig bidding, trading/arbitrage, and more, extensible).
Every dollar is tracked per-wallet in a **tamper-evident, hash-chained ledger**
(reusing the repo's audit pattern) and cross-linked into the global audit log. When a
wallet's **realized** profit crosses **$100**, its capital is split (default 50/50) and
a **clone agent** is spawned (via the existing kernel spawn) to keep earning
independently — automatically in simulation, behind a signed human-approval gate in
live mode. Clones share "which strategies work" via the existing cross-node recall +
signed-RPC mechanism. The fleet compounds over time, under hard ceilings, fully auditable.

---

## 2. The 11-step BMAD workflow (executed per section, in order, never skipped/merged)

| Step | Artifact | Owner persona |
|---|---|---|
| 1 | `01-brainstorming.md` | Product (First Principles, SCAMPER, ideation mapping) |
| 2 | `02-research.md` | Research (current web data, verified sources) |
| 3 | `03-product-brief.md` | Product |
| 4 | `04-prd.md` | Product |
| 5 | `05-ux-design.md` | UX |
| 6 | `06-architecture.md` | Architecture |
| 7 | `07-epics-and-stories.md` | SM / Architecture |
| 8 | `08-sprint-planning.md` | SM |
| 9 | `09-story-spec.md` | Dev (implementation prep) |
| 10 | `10-dev-story.md` | Dev (implement + tests + validate) |
| 11 | `11-code-review.md` | QA (adversarial Senior Dev review — fixes required before approval) |

**Definition of COMPLETE.** A section is marked `COMPLETE: 100% READY` **only when**
all 11 artifacts exist, the implementation is tested, and Step 11 adversarial review
passes with required fixes applied. Pacing is strictly sequential: **no section N+1
begins until section N is `COMPLETE: 100% READY`.**

---

## 3. How the 100 sections are categorized across the lifecycle

The 100 sections are grouped into **9 lifecycle categories (A–I)**. The category order
encodes the dependency-correct build sequence from the founding spec
(ledger proof first → strategy → spend+caps → rollback → sandbox+denylist → learning →
mitosis → live approval → knowledge sharing). Each section lives inside exactly one
category. Counts sum to 100.

| Cat | Range | # | Theme | Maps to Part / Rules |
|---|---|---|---|---|
| **A** | S01–S10 | 10 | **Foundation & Governance** — repo hygiene precondition, Option-C module scaffold, ADR-0031, legal/regulatory research, threat model, denylist v1, safety-invariant harness, naming/conventions, doc scaffold, E10-S30 gate verification | Foundation / R1, R5 |
| **B** | S11–S26 | 16 | **The Ledger Core** (Part 2) — wallet model; hash-chained ledger schema (PG **and** SQLite); append/verify reusing `audit.ts` pattern; cross-link to global audit; tamper-detection proof; realized-vs-pending accounting; units/currency; `ledger:*` scopes; replay/audit endpoints | Part 2 / R7 |
| **C** | S27–S46 | 20 | **Strategy Framework** (Part 1) — strategy contract; saga wrapper + compensation; capability manifest + default-deny sandbox integration; **denylist gate**; registry; simulation runner; outcome tracking (reuse skill outcome-rating); the three starter categories (content/affiliate, freelance bidding, trading/arbitrage) decomposed; agent-written strategy packaging + validation | Part 1 / R1, R5 |
| **D** | S47–S56 | 10 | **Money Movement & Caps** — spend/withdraw; **hard per-action + per-day caps**; **no-leverage/no-borrow by design** (adapter exposes no borrow fn); custodial credential model (narrow/short-lived/capped); payment-adapter abstraction; reconciliation; failure handling | Part 1/2 / R2, R3 |
| **E** | S57–S63 | 7 | **Learning & Selection** — strategy scoring; weighted/bandit selection with exploration of underdogs; simulation track-record ledger; promotion evidence requirements | Part 1 / R1 |
| **F** | S64–S79 | 16 | **Mitosis Protocol** (Part 3) — realized-profit computation; $100 threshold; configurable split rule (default 50/50); clone-spawn via existing kernel spawn (Ring 3, parent/child); **sim auto-mitosis**; **live signed-approval gate**; promotion-to-live signing; **fleet ceilings** (max clones/generation/capital); enforcement + alerting; clone lineage/provenance | Part 3 / R1, R4, R6, R7 |
| **G** | S80–S87 | 8 | **Cross-Agent Knowledge Sharing** — parent/child + sibling sync via cross-node recall + signed RPC; "which strategies work" propagation; isolation/privacy; merge/conflict | Part 3 / R7 |
| **H** | S88–S93 | 6 | **CLI / Agent Integration Surface** — MCP tool surface (`nexus_revenue_*`); REST API; scopes/auth; CLI-agent connect/onboarding flow; revenue observability/metrics | Integration |
| **I** | S94–S100 | 7 | **Hardening, Audit & Release** — adversarial security review of money paths; end-to-end audit-replay verification; chaos/failure injection; golden-path E2E; documentation; release gate; post-release monitoring | R7 / Release |

**Dependency note.** Categories A→I are ordered; within a category the sections are
ordered to respect dependencies. The first buildable proof (founding spec: wallet +
ledger + tamper-detection) lands at the **start of category B (S11)**.

---

## 4. Document repository structure

The expansion's full BMAD pipeline lives in an **isolated home** so it does not clutter
the canonical existing BMAD docs while in progress. At defined **merge checkpoints**
(see §5), approved outputs are folded into the canonical docs.

```
docs/bmad/revenue-engine/
  MASTER_PROJECT_PLAN.md          # this file
  section-index.md                # the 100-section registry + live status (generated after params)
  parameters.md                   # frozen initial project parameters (after you answer §6)
  shared/
    safety-invariants.md          # the 7 rules as machine-checkable invariants + test mapping
    denylist.md                   # strategy denylist, versioned (R5) — referenced by S27/S35
    glossary.md
    traceability-matrix.md        # section → Part/Rule → existing-primitive-reused → tests
    merge-checkpoint-log.md       # what merged into canonical docs, when, by whom
  sections/
    S01-<slug>/
      01-brainstorming.md … 11-code-review.md
      STATUS.md                   # per-step gate + "COMPLETE: 100% READY" marker
    S02-<slug>/ …
    …
    S100-<slug>/
```

**File-name convention.** `S##-<kebab-slug>/` for the section folder; the 11 step
files use the fixed names in §2 so tooling and reviews are uniform. Each `STATUS.md`
holds the 11-step checklist + acceptance criteria + the single authoritative completion
flag.

---

## 5. Merge checkpoints (isolated pipeline → canonical existing docs)

To honor "update the existing BMAD docs," approved section outputs are merged into the
canonical artifacts at these gates (recorded in `shared/merge-checkpoint-log.md`):

| After category | Canonical doc updated | What is added |
|---|---|---|
| **A** completes | `docs/adr/0031-…` + `docs/adr/README.md` | New ADR (Option C, reuse, 7 rules); ADR index row + existence-note bump |
| **A** completes | `docs/bmad/04-prd.md`, `docs/bmad/06-architecture.md` | Scope statement, NFR-REV (7 rules), module boundary "5.10 Revenue Engine & Ledger" |
| **B** completes | `docs/bmad/07-epics-and-stories.md`, `docs/bmad/sprint-status.yaml` | Epic E11 + Ledger stories; post-R1 sprint entry |
| … each later category | same canonical docs | Appending the category's approved epics/stories/architecture |

Final naming/numbering (Epic **E11** / ADR **0031** / Phase **21**) is **confirmed in §6**.

---

## 6. Initial project parameters (REQUIRED before I generate the 100 sections)

Please confirm or correct each. Defaults are pre-filled from what you've already told me.

1. **Project Name** — default: *Autonomous Revenue Engine & Mitosis* (working codename welcome).
2. **Epic / ADR / Phase labels** — default: Epic **E11**, ADR **0031**, Phase **21**. (You earlier chose "custom" — tell me your preferred labels.)
3. **Core Idea (one sentence)** — default: *"An isolated module of Agentic-OS-V3 that lets the CLI AI earn money autonomously via pluggable strategies, tracked in a tamper-evident per-wallet ledger, with capital splitting + agent cloning above $100 realized profit; simulation-first, human-gated for real money, hard-capped, denylist-gated."* — confirm or rewrite.
4. **Tech Stack** — default: reuse Agentic-OS-V3 stack (TypeScript/Hono server, Drizzle over Postgres+SQLite, React/Vite dashboard), new code as an isolated module (Option C) behind a feature flag + kill switch; integration via MCP + REST; reuse existing audit/saga/WASM-sandbox/kernel/scopes. Confirm or adjust (e.g., add a specific language/runtime, external SDKs).
5. **CLI AI identity** — is the connecting CLI agent the **existing OS CLI agent** (`server/src/cli.ts`, MCP), or a **new external CLI**? Default: existing.
6. **Starting strategy category to build first** — default: **content/affiliate** (lowest risk for simulation). Alternatives: freelance-gig bidding, trading/arbitrage.
7. **Currency / unit** — default: **USD**, fixed-point integer cents. Confirm.
8. **Fleet ceiling defaults** (R6) — default: max clones **50**, max generation depth **5**, max total capital **$10,000**. Confirm or set your own.
9. **Out-of-scope / non-goals** — e.g., crypto custody, real exchange keys in v1. List anything you want explicitly excluded.

---

## 7. What happens next

1. You answer §6 (any subset; defaults stand for the rest).
2. I generate **`section-index.md`** — the full list of all **100 sections** with titles,
   one-line scope, category, dependencies, and the founding-spec Part/Rule each serves.
3. We begin **Section 1 (S01)** through the 11-step workflow. Nothing else starts until
   S01 is `COMPLETE: 100% READY`.

> No code, no canonical-doc edits, and no 100-section list are produced until §6 is answered.

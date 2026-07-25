# STATUS — S01 · Repo Hygiene Precondition

> **Category A — Foundation & Governance** · Depends on: (none) · Rules: Foundation
> **Started:** 2026-07-25 · **Owner:** Lead Orchestrator
> A section is `COMPLETE: 100% READY` only when every step below is ✅ AND the Step-11
> adversarial review passes with required fixes applied. No section N+1 begins until N is complete.

## 11-step gate

| Step | Artifact | Status |
|---|---|---|
| 1 | `01-brainstorming.md` | ✅ complete |
| 2 | `02-research.md` | ✅ complete |
| 3 | `03-product-brief.md` | ✅ complete |
| 4 | `04-prd.md` | ✅ complete |
| 5 | `05-ux-design.md` | ✅ complete |
| 6 | `06-architecture.md` | ✅ complete |
| 7 | `07-epics-and-stories.md` | ✅ complete |
| 8 | `08-sprint-planning.md` | ✅ complete |
| 9 | `09-story-spec.md` | ✅ complete |
| 10 | `10-dev-story.md` | ✅ complete |
| 11 | `11-code-review.md` | ✅ complete (APPROVED) |

## Acceptance criteria (definition of done for S01)
1. `pnpm install` completes successfully (incl. native `better-sqlite3`) on the workspace.
2. A representative test command runs without environment-failure noise (no native-ABI break).
3. All clearly-junk scratch/output files are removed AND prevented from recurring via `.gitignore`.
4. All empty 0-byte files that are unreferenced are removed (referenced ones are documented, not silently deleted).
5. A clean, attributable baseline is snapshotted so future Revenue-Engine changes are diffable.
6. No existing functionality or tests are broken by the cleanup.
7. Step-11 adversarial review confirms the cleanup is safe, minimal, and reversible.

## Completion flag
`STATUS: IN PROGRESS — Step 1 of 11`

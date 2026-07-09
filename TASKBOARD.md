# TASKBOARD.md

> Canonical task-board pointer for the NEXUS 2.0 Agentic OS fleet.
> Maintained by **Lorekeeper / Leader**; this file is a stable landing page so
> `AGENTS.md` and other docs can link to a single task-board entry point.

## Where the task board lives

The live task board is the **team task board** (the `team_task_list` surface used
by the 20-agent fleet), not a file in this repo. For a file-based, human-readable
snapshot of plan/progress, see:

- **`docs/PLAN_TRACKER.md`** — the authoritative plan-tracking index (Phases 11–20
  owner/status, compile-gate status, companion-doc map). Maintained by Lorekeeper.
- **`docs/PERFECTION_METRICS.md`** — the live perfection dashboard (coverage,
  lint, gate status).
- **`docs/TEAM_OWNERSHIP_GOVERNANCE.md`** — the 20-agent namespace → owner map.
- **`docs/adr/README.md`** — Architecture Decision Record index (ADR-0001 … 0020).

## How agents use it

1. Pull the next item from your area backlog (issue/PR labeled with your agent name,
   an open ADR/phase gap, or a `TODO`/`stub` in your exclusive namespace).
2. Implement, run your local gate, open a PR (title prefixed with your agent name).
3. Quill owns the merge gate (`cd server && npm run validate` must be green).
4. Loop. Never idle. When docs are complete, message the Leader for reconciliation
   against `docs/PLAN_TRACKER.md` and `docs/PERFECTION_METRICS.md`.

## Notes

- This file was created by DocA (2026-07-09) to resolve a broken `AGENTS.md`
  reference to a non-existent `TASKBOARD.md`. It is a pointer, not a live board.
- Do not duplicate task state here; the team task board and `docs/PLAN_TRACKER.md`
  remain the source of truth.

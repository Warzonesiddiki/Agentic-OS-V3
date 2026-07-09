# ADR-0027: CI/CD Pipeline

- Status: Accepted
- Date: 2026-07-09
- Deciders: Bastion (owner), Quill, Leader

## Context

The pnpm monorepo (dashboard, `server/`, `packages/*`, `crates/`, `nexus-tauri/`)
needs a CI that validates every layer and blocks merges on regression. The
autonomous fleet (ADR-0011 gate discipline) requires the merge gate to be
authoritative and reproducible. We need GitHub Actions covering lint/typecheck/
test/build for all members + a deploy path.

## Decision

`.github/workflows/ci.yml` + `deploy.yml` (Bastion-owned, in the exclusive
namespace):

- **Workspace gate:** `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r
  build` — validates every member (packages, server, nexus-tauri) so a broken
  crate/SDK fails CI, not prod.
- **Server deep gate:** `cd server && npm run validate` (lint + typecheck + unit +
  integration gate + build) — the authoritative merge gate Quill enforces.
- **Rust:** `cargo build --workspace && cargo clippy --all-targets -- -D warnings &&
  cargo test --workspace` keeps `crates/` from rotting (ADR-0007 decoupled but
  still CI-validated).
- **Tauri:** builds `nexus-tauri/src-tauri` (ADR-0021) as part of the desktop
  pipeline.
- **Pre-push hook:** husky runs `pnpm -r lint` and blocks push on lint errors
  (the fleet hit a 71-lint-error residual that had to reach 0 before push).
- **Deploy:** `deploy.yml` builds the dashboard to `dist/`, the server to
  `server/dist`, and ships per `docs/DEPLOYMENT.md` / `PRODUCTION_CHECKLIST.md` /
  `DR_RUNBOOK.md` (Bastion-owned docs).

## Consequences

- One CI definition enforces the same gate the fleet uses locally (ADR-0011 fresh
  `tsc --incremental false`); merges are blocked on any regression.
- Rust + Tauri are first-class CI citizens, so the decoupled surfaces can't silently
  break.
- Lint is a hard gate (husky + CI), keeping the codebase at the Perfection Bar.
- Tests: CI itself is the test; `scripts/verify-system-readiness.ts` and
  `profile-system-performance.ts` run as CI checks.
- Operational note: integration tests need `DATABASE_URL` (Postgres); they fail
  loudly if unreachable, never silently green.

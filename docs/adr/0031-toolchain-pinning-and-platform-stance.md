# ADR-0031: Toolchain Pinning & Platform Stance (WS0)

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Bastion (implementation), Leader (decision D3/D4 of the Master Progression Plan §9)
- **Supersedes:** the implicit "Node >=20, any pnpm" posture; amends ADR-0002's dual-backend runtime assumptions regarding the native SQLite binding.

## Context

The Gate-0 baseline (`docs/bmad/baseline-2026-07-24-gate0.md`) requires a reproducible clean-machine golden path (blocker B4) and a green full suite on a supported environment (B1). Live verification at HEAD `a3c30f6` (progression-plan §2.2/§2.4) showed:

- better-sqlite3@11 has no prebuilt binary and cannot compile on Node ≥23 (removed V8 APIs); the ledger's validated environment is Node 22.22.3 + pnpm 9.15 on Linux.
- No `packageManager` field existed → corepack/pnpm drift.
- The R1 constrained-command sandbox hard-throws on win32 (`r1-sandbox-runner.ts`).

## Decision

1. **Node line pinned to `^22.x`** via root `engines.node`; `.nvmrc` = `22`; `.npmrc` gains `engine-strict=true` so mismatched environments fail loudly instead of half-working.
2. **pnpm pinned to 9.15.0** via root `packageManager`, matching the existing v9.0 lockfile.
3. **better-sqlite3 stays at v11 for R1.** Upgrade to v12 prebuilds (and any Node 24/26 support line) is post-R1 work only; no native dependency churn mid-requalification.
4. **R1 is POSIX-first.** Official Windows path is WSL2 (Ubuntu 22.04+). Native win32 sandbox support is post-R1. The win32 hard throw must be replaced with surfaced degraded-mode status plus a README support matrix (remaining WS6 work).
5. Build-script approvals already present in `pnpm-workspace.yaml` (`allowBuilds`) are retained; under pnpm 9 build scripts run by default, so the key is forward-compatible metadata for a future pnpm 10 migration.

## Consequences

- Contributors on Node ≠22 get an immediate install failure pointing at `.nvmrc` (intended).
- CI must run on Node 22 images; jobs relying on newer Node lines will fail the engine gate by design.
- Windows developers use WSL2 for server-side work until native win32 lands post-R1.
- The upgrade path (better-sqlite3 v12, Node 24/26) is explicitly deferred, not forgotten: it is tracked in progression-plan §6 post-R1 items.

## Evidence

Ratification record: `docs/bmad/progression-plan-2026-08-21.md` §9 (commit `8024bdd`). Verification transcripts for this decision land in `docs/bmad/releases/evidence/` under the WS0 prefix (`2026-08-24-ws0-*`).

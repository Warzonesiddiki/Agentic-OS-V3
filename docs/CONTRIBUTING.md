# Contributing to NEXUS 2.0 / Agentic OS V3

Thanks for your interest in contributing! This repo is a pnpm monorepo spanning a
React dashboard, a Hono/TypeScript backend, shared TS packages, a Rust provider
workspace, and a Tauri desktop shell. It is maintained by a fleet of agents under a
strict compile + merge gate — please keep your changes green.

## Prerequisites

- Node 18+ and pnpm (`corepack enable`)
- Rust toolchain (for `crates/` + Tauri): `rustup` with the stable target
- Postgres 17 + pgvector for **integration** tests (`DATABASE_URL`)
- A `.env` file copied from `.env.example` (never commit secrets)

## Build / test / validate quickstart

```bash
# ── Install ──
pnpm install                      # install all workspace members

# ── Browser dashboard (Vite + React, root src/) ──
npm run dev                       # vite dev server (http://localhost:5173)
npx vite build                    # build dashboard to dist/

# ── Root workspace (pnpm) ──
pnpm -r build                     # build all members (packages/*, server, nexus-tauri)
pnpm -r test                      # test all members
pnpm -r lint                      # lint all members
pnpm -r typecheck                 # typecheck all members
npm run validate                  # pnpm -r lint && typecheck && test && build

# ── Server (Hono/TS, port 9900) ──
cd server && npm run build        # tsc -> dist/
cd server && npm run dev          # tsx watch src/index.ts
cd server && npm start            # node dist/index.js
cd server && npm test             # Vitest unit tests (no DB)
cd server && npx vitest run path/to/file.test.ts   # single test file
cd server && npx vitest run -t "recall budget"      # single test by name
cd server && npm run test:integration   # needs DATABASE_URL (Postgres)
cd server && npm run validate     # lint + typecheck + test + integration gate + build  ← MERGE GATE

# ── Rust crates (crates/) ──
cargo build --workspace
cargo check --workspace
cargo clippy --all-targets -- -D warnings
cargo test --workspace

# ── Tauri desktop (Tess) ──
cd nexus-tauri/src-tauri && cargo build

# ── Lint / format (root) ──
cd server && npm run lint         # ESLint (server)
prettier --write 'packages/**/*.ts'
npx eslint src/ --max-warnings 0
# git commit triggers lint-staged (prettier + eslint) via husky
```

## The compile gate (READ THIS)

`tsc --noEmit` (default incremental) can return 0 even with real errors because of
a stale `.tsbuildinfo`. The **authoritative** gate is:

```bash
cd server && rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false
```

It **must be 0** before you claim anything is green. See `docs/adr/0011-phantom-gate-discipline.md`.

## Before opening a PR

1. Run `cd server && npm run validate` (server) and `pnpm -r lint typecheck test build` (workspace).
2. Confirm the fresh `tsc` gate above is 0.
3. Title your PR with your agent/area prefix (e.g. `Forge: close GAP 11.13`).
4. Do not bypass the husky pre-push lint hook (`--no-verify` is forbidden).
5. Respect exclusive file namespaces (`docs/TEAM_OWNERSHIP_GOVERNANCE.md`) and the
   FROZEN core files (need Leader sign-off to edit).

## Architecture & ADRs

- Start with `AGENTS.md` (operating model, namespaces, conventions).
- Architecture Decision Records live in `docs/adr/` — index in `docs/adr/README.md`
  (ADR-0001 … ADR-0030). Read the relevant ADR before changing a ratified subsystem.
- Plan tracking: `docs/PLAN_TRACKER.md`; perfection dashboard: `docs/PERFECTION_METRICS.md`.

## Code style

2-space indent, LF endings, single quotes, trailing commas. TypeScript `strict`
mode — no `any` where possible. Rust: `thiserror` + `AgenticError`, `tracing`,
bounded `mpsc`, `spawn_blocking` for CPU work. See `AGENTS.md` "Project conventions".

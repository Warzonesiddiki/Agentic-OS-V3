> **Historical snapshot — not current R1 release evidence.** This dated record is preserved unchanged for traceability. It was superseded for current-state decisions on 2026-07-24 by `docs/bmad/baseline-2026-07-24-gate0.md` and the machine-readable release ledger. R1 is release blocked pending independent E10-S30 review.

# Repository Validation Baseline — Verified Re-run (2026-07-21)

**Supersedes the estimates in `baseline-2026-07-21.md`.** This file records a
reproducible re-run **with workspace dependencies installed**, which the
original baseline could not do (it was captured with `pnpm` absent and deps
uninstalled). It is the authoritative "known failures" snapshot referenced by
`sprint-status.yaml` for story **E0-S1**.

> No failures are suppressed. Exit codes are preserved. The intent is to let
> later stories distinguish pre-existing failures from regressions.

## 1. Environment

| Tool | Version | Notes |
|---|---|---|
| Node | v26.5.0 | present |
| pnpm | 11.13.0 | **present** — resolves the "pnpm absent" blocker recorded in the original baseline |
| npm | 10.x | present |
| corepack | ABSENT | not installed |
| cargo / rustc | ABSENT | Rust toolchain not installed |
| OS | Windows (PowerShell) | statement separator `;`, not `&&` |

## 2. Install

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | **PASS** (~17s). Workspace linked; `@types/node` added to `packages/sdk` and `packages/devtools` to clear Node-builtin type errors. |
| `pnpm install` (full native lifecycle) | **BLOCKED** by `better-sqlite3` node-gyp build failing to download Node headers (TLS/network). Blocks runtime unit tests that import the native addon. |

## 3. Validation dimensions

### 3.1 Typecheck — `pnpm -r typecheck`

Runs 5 of 6 workspace projects (nexus-tauri has no typecheck script).

| Package | Result |
|---|---|
| packages/sdk | **PASS** |
| packages/a2a-server | **PASS** |
| packages/devtools | **PASS** (after `@types/node` added) |
| server | **FAIL — 96 errors** (see 3.1.1) |

#### 3.1.1 Server typecheck error catalog (96 errors)

- `lib/env` exports `Env`, not `env` — many files import `{ env }`:
  `src/app.ts`, `src/services/skill-compiler.ts`, `skill-template-engine.ts`,
  `task-worker.ts`, `vault.ts`, `unified-gateway/portkey/client.ts`.
- Missing `Env` keys referenced in code (type gap):
  `NEXUS_MCP_ORIGIN` (`cli.ts`), `GEOFENCE_ALLOW/DENY_COUNTRIES/ASNS`
  (`geo-fence.ts`), `HSM_BACKEND` / `VAULT_ADDR` / `VAULT_TOKEN`
  (`hsm-provider.ts`), `NEXUS_MLFQ_BOOST_MS` (`scheduler.ts`).
- `src/services/scheduler.ts(1362)`: Cannot find name `latencySamples`;
  `(1363)`: implicit `any` params.
- `src/services/security-posture.ts(186-211)`: expression is not callable
  (`{}` has no call signatures).
- `src/services/skill-compiler.ts(203,230)`: Cannot find name `sanitizeForComment`.
- `src/services/specialization-registry.ts(12)`: Cannot find module
  `@agentic-os/a2a-server`.
- `src/services/trace-exporter.ts(107)`: Cannot find name `db`.
- `src/services/unified-gateway/connection-pool.ts(43)`: Cannot find module `undici`.
- `src/services/unified-gateway/llm-cache.ts(48,58)`: `LRUCache<K,V>` requires 2 type args.
- `src/services/vlm.ts(86)`: `string | undefined` not assignable to `string`.
- `src/lib/auth-context.ts(29)`: `Scope[]` not assignable to `Principal`.

### 3.2 Lint — `cd server && npm run lint`

**536 errors, 90 warnings (626 problems).** First error: `'Buffer' is not
defined` (`no-undef`) on the SDK `webhooks.ts` path consumed without Node env.
The root `npm run lint` (`cd server && npm run lint`) is the deterministic
entry point used here.

### 3.3 Unit tests — `cd server && npm test`

**BLOCKED** by `better-sqlite3` native binding failing to load (network/TLS for
Node headers). DB-free unit tests are mocked at the module level, but the
native addon import aborts at module load. This is an environment/install
blocker, not a test-logic failure.

### 3.4 Frontend build — `npm run build:frontend` (`vite build`)

**PASS** (1 CSS minifier warning), per the original baseline.

### 3.5 Rust — `cargo check --workspace`

**BLOCKED**: `cargo` ABSENT (Rust toolchain not installed).

## 4. Notes

- The original baseline undercounted server typecheck errors as "2"; with
  dependencies installed, `pnpm -r` fails fast at the first failing package,
  revealing the **true** server error set (96).
- `pnpm` is now present, so the E0-S1 install-path blocker is **resolved**.
  The remaining failures are pre-existing code defects owned by their
  respective areas and tracked for fix in follow-up stories.
- Two minimal, correct fixes were applied to clear package-level gates:
  added `@types/node` to `packages/sdk` and `packages/devtools` (they consume
  Node built-ins via `webhooks.ts`), and added `packages/sdk/vitest.config.ts`
  so SDK tests do not inherit the frontend DOM setup.

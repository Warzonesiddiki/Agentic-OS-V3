# Story E0-S1 — Establish repository validation baseline

**Epic:** E0 — Baseline and domain contracts  
**Priority:** P0  
**Estimate:** 3 points  
**Sprint:** sprint-1  
**Status:** blocked  
**Source:** `docs/bmad/07-epics-and-stories.md`

## User story

As a maintainer, I want a reproducible validation baseline so that later stories can distinguish existing failures from regressions.

## Acceptance criteria

- [x] Document Node/package-manager requirements and the supported install command.
- [x] Run or explicitly record the result of lint, typecheck, unit tests, frontend tests, and Rust checks.
- [x] Capture existing failures by command, package, and classification without suppressing them.
- [x] Identify the existing CI/local validation entry points and verify their non-zero behavior when tools are missing.
- [x] Record the baseline in `docs/bmad/baseline-2026-07-21.md` and link it from the sprint status file.

## Implementation tasks

1. Inspect repository package manifests, lockfiles, scripts, and tool availability.
2. Run the existing validation entry points without installing or mutating dependencies as part of the baseline.
3. Record successful commands, blocked commands, exact errors, environment versions, and repository commit.
4. Verify whether the existing `npm run validate`/package scripts are a usable deterministic entry point.
5. Add only the minimum documentation or script change required to make the baseline reproducible.
6. Update sprint status with evidence and any blocker.

## Validation commands

```bash
node --version
npm --version
pnpm --version
npm run lint
npm run typecheck
npm test
npm run build:frontend
cargo check --workspace
```

## Security and quality notes

- Do not use `|| true`, silent catch blocks, or truncated output that hides failures.
- Do not install dependencies or generate lockfiles while measuring the clean baseline.
- Do not include credentials, environment values, or machine-specific secrets in the artifact.
- Preserve exact exit status for each command.

## Implementation notes

- The repository declares a pnpm workspace and `pnpm-lock.yaml` is intended to be the canonical lockfile; `DEVELOPMENT.md` now documents `corepack enable` followed by `pnpm install --frozen-lockfile`.
- The root `package.json` currently has no dependency keys while the root lockfile importer contains dependencies/devDependencies; the install path is therefore an explicit blocker until reconciled and verified.
- The existing root/server validation scripts are deterministic chained commands and fail with non-zero status when dependencies are unavailable, but the frontend script uses `npx` and can auto-install a tool, so it is not a clean deterministic baseline command.
- This environment has Node/npm but no pnpm, Rust toolchain, or installed workspace dependencies.
- `npm run build:frontend` initially failed because the Vite config dependencies were unavailable; the root manifest and local-tool script were repaired, and the build now completes with one CSS minifier warning.
- The root `tsconfig.json` initially contained two adjacent JSON objects; the duplicate object was removed so the frontend/test config can load.
- A frozen workspace install now passes with `--ignore-scripts`; the full native lifecycle install remains blocked by `better-sqlite3` TLS/header download failure.
- Lint, typecheck, and tests were rerun after static linking and remain non-green; exact results are in the baseline and review artifacts.
- The adversarial review requested changes; the story remains blocked and is not marked done.

## Expected evidence

- `docs/bmad/baseline-2026-07-21.md`
- This story file updated with results.
- `docs/bmad/sprint-status.yaml` updated with evidence and status.

## Review focus

- Are all required validation dimensions represented?
- Are blocked commands distinguishable from failed commands?
- Does the documented install command match the repository lockfile and scripts?
- Is the validation entry point deterministic and non-silent?
- Could the baseline be rerun by another developer on a clean checkout?

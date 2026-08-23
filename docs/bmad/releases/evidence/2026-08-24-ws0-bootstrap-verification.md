# WS0 Bootstrap Verification Evidence — 2026-08-24 (Windows, Node 22)

**Workstream:** WS0 Reproducible bootstrap & toolchain pinning (progression-plan §4; ADR-0031).
**Environment:** Windows 11 (10.0.26200), portable **Node v22.23.2**, **pnpm 9.15.0** (per `packageManager` pin, commit `ccabfe1`), engine-strict enabled.
**Result: PASS on all Windows gates.** POSIX twin deferred to CI (see §Caveats).

## A. Cold-install verification (repo working copy)

- Transcript: `2026-08-24-ws0-windows-node22-transcript.log`
- Sequence: wipe all `node_modules` → `npx pnpm@9.15.0 install` → `npm run typecheck` (server true-gate) → `npx vitest run` (full unit suite).
- **INSTALL EXIT: 0** · **TYPECHECK EXIT: 0**
- Full suite: **27 failed / 228 passed files · 60 failed / 2428 passed / 1 skipped tests** (duration ~70s).
- Failure digest: `2026-08-24-ws0-windows-failure-digest.txt`
- Baseline delta vs progression-plan §2.2 (Node 26, no native binding): **67 → 27 failing files**. The entire environment/native-binding failure class is eliminated by the Node 22 + cold install path.

## B. Clean-clone verification (fresh-machine simulation)

- Transcript: `2026-08-24-ws0-windows-node22-cleanclone-transcript.log`
- Sequence: `git clone --no-hardlinks` to an empty temp dir → inspect bootstrap surface → install → typecheck → targeted suite (`recall`, `kernel`, `security`).
- **INSTALL EXIT: 0 · TYPECHECK EXIT: 0 · TARGETED EXIT: 0 (3 files / 80 tests passed)**.
- Conclusion: a fresh machine following the committed docs/toolchain alone reaches a green targeted build on Windows.

## C. Caveats (honest boundaries)

1. **POSIX twin transcript not produced locally** — WSL2 is not installed on this host. Per D3/D4 the authoritative supported-environment full-suite run is the CI Linux (ubuntu, Node 22) job; it becomes the B1 confirmation run after WS1 wave fixes land. WS0's two-OS criterion is therefore *conditionally* satisfied: Windows proven locally, POSIX pending first CI run.
2. The 27 remaining failing files decompose into: stale mock/import contracts (Batch A — repair in progress), product defects (Forge/Sentinel/Helix/Aegis/Metron/Pulse waves — queued), and `r1-sandbox-runner.test.ts` which fails **by design on win32** until WS6 graceful degradation lands.
3. Full-suite numbers from this Windows run are diagnostic evidence only; they do not by themselves confirm Gate-0 blocker B1 (that requires the retained green run on the supported POSIX environment).

## Disposition

WS0 exit criteria met on Windows with the documented CI caveat; toolchain pins are committed and enforced (`engine-strict=true`). Next: WS1 wave execution against this inventory; ledger updated per exact-file repair with before/after reruns.

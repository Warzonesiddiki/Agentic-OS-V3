# NEXUS 2.0 — Known Baseline Unit-Test Failures

**Date:** 2026-07-08

**Command run (from repo root):**

```powershell
$NODE_BIN = "C:\Users\Tahir\AppData\Local\hermes\node\node.exe"
cd server
& $NODE_BIN node_modules/vitest/vitest.mjs run
```

> Note: default `node` on this machine is a broken v9; the Hermes-bundled Node at `$NODE_BIN` was used instead. The unit config excludes `tests/integration/**`, so no PostgreSQL (`DATABASE_URL`) is required.

## Summary

- **Test files:** 44 total → 39 passed, **5 failed**
- **Tests:** 547 total → 471 passed, **59 failed**, 17 skipped
- **Duration:** 18.04s (vitest 3.2.6)

## Failing test files (every file)

- `tests/federated-recall.test.ts` — 1 failed. Headline: `expected 100 to be 10 // Object.is equality` (federated-recall → privacyBudgetForTopic → "respects env override").
- `tests/services/recall.test.ts` — 19 failed (entire file). Headline: `UNIQUE constraint failed: notes.path` (recall service → "returns relevant results for keyword queries").
- `tests/services/agent-runtime.test.ts` — 1 failed test + 3 failed suites. Headline: `SqliteError: Audit log is append-only. Mutation not allowed.` (suites "executeActionWithTimeout — real DB auth flow", "Agent Persistence — real DB", "runAgent — real DB + mocked LLM"); the single in-file test failure is `ActionRegistry > execute runs handler and succeeds → expected false to be true`.
- `tests/services/brain.test.ts` — 7 failed. Headline: `mem insert failed: UNIQUE constraint failed: memories.id` (brain service → exportBrain → "exports memories and skills"); also present: `Transaction function cannot return a promise` (importBrain "inserts valid payload" / "handles empty arrays") and `SqliteError: SQL logic error` (exportBrain → "handles empty DB").
- `tests/services/kernel.test.ts` — 31 failed. Headline: `[vitest] No "ringPolicies" export is defined on the "../../src/db/client.js" mock. Did you forget to return it from "vi.mock"?` (kernel service → spawnAgent → "creates agent with defaults"), repeated across spawnAgent/getAgent/getAgentState/listAgents/updateAgentState/pauseAgent/resumeAgent/terminateAgent/quarantineAgent/incrementTokenUsage/enqueueTask/pickNextTask/completeTask/failTask/listAgentTasks/recoverAgentProcesses.

## Status note

These are **KNOWN BASELINE failures** as of the start of the Phases 11–20 work. They are recorded for regression detection only — they have **NOT** been fixed. New work in Phases 11–20 must **not add to this list** (any newly-failing test file is a regression and must be investigated, not appended here).

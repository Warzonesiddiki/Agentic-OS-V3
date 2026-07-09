# safety.service

## Purpose
Kill-switch + operational-gate primitives. The canonical seam for halting the OS. `isKillSwitchOn(tx?)`,
`assertOperational(tx?)` (throws HTTP 423 when engaged), and `assertKillSwitchConsistent(tx, expected)`
(double-assert after a kill-switch write — closes the Phase 1.7 race). (Sentinel-owned.)

## Public exports
- `async function isKillSwitchOn(tx?: DbTx): Promise<boolean>`.
- `async function assertOperational(tx?: DbTx): Promise<void>`.
- `async function assertKillSwitchConsistent(tx: DbTx, expected: boolean): Promise<void>`.

## Env vars
None directly (state persisted in the kill-switch table).

## Test file
- `server/tests/safety.service.test.ts` (assertOperational throws when on, double-assert).

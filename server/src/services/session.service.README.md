# session.service

## Purpose
Operator session management + the kill-switch control seam. `setKillSwitch(enabled, actor, reason)` wires a
pre-flight check + in-transaction `assertOperational` + `assertKillSwitchConsistent` (double-assert),
closing a Phase 1.7 race. `getKillSwitch()` reports the current state. (Sentinel-owned coordination seam.)

## Public exports
- `async function setKillSwitch(enabled: boolean, actor: string, reason?: string): Promise<void>`.
- `async function getKillSwitch(): Promise<{ enabled: boolean; reason?: string; setBy?: string }>`.

## Env vars
None directly (uses the kill-switch table + `safety.service`).

## Test file
- `server/tests/session.service.test.ts` (setKillSwitch double-assert, getKillSwitch).

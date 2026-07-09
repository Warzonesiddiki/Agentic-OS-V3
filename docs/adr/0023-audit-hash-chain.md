# ADR-0023: Audit Hash-Chain (append-only, tamper-evident)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Aegis (owner), Sentinel, Forge, Leader
- Supersedes: — (core security primitive)

## Context

Compliance (Phase 14) and the autonomous-operations manual require an
**append-only, tamper-evident** audit log. Simple append is not enough — an
attacker who gains DB write could rewrite history. We need each record to commit
to the previous one so retroactive edits are detectable, and we need the chain to
survive restarts and span both TS (`audit-engine.ts`) and the meta-loops
(ML-001/002/003).

## Decision

`server/src/services/audit-engine.ts` implements a **hash chain**:

- Each audit entry stores `prevHash` (SHA-256 of the prior entry's canonical form)
  and its own `hash = SHA-256(prevHash || canonical(entry))`. The first entry
  chains off a fixed genesis.
- `appendAudit` (used widely, e.g. by `skill-compiler.ts` via `lib/audit.js`)
  computes and stores the chain hash atomically in the same transaction that
  writes the row — no gap between write and chain update.
- **Verification:** `verifyChain()` replays the chain and fails on any hash
  mismatch, exposing tampering. A scheduled `audit-watchdog.ts` re-verifies
  continuously; `audit-worker.ts` flushes buffered entries.
- **Durability:** chain state is persisted in the Drizzle `audit_log` table
  (`db/schema.ts`); `audit-analytics.ts` + `evidence-collector.ts` build on top.
- **Cross-cutting:** the self-opt harness (ADR-0014) and chaos experiments
  (ADR-0020) also append to the same chain, so every autonomous action is
  attributable and tamper-evident.

## Consequences

- Audit history is tamper-evident: any post-hoc edit breaks the chain and is
  caught by `verifyChain` / the watchdog.
- All autonomous actions (self-opt proposals, chaos drills) are recorded, satisfying
  the autonomous-operations manual's hash-chained audit requirement.
- Slight write overhead (hashing per entry) — bounded and acceptable for an audit
  path; high-throughput event streams use the separate `trace`/`metrics` paths.
- Tests: `audit-engine.test.ts` covers chain build, tamper detection, and
  `verifyChain` after a simulated edit; `session-recorder.test.ts` asserts the
  same hash-chain contract on session transcripts.
- Operational note: on verify failure, the system raises a breach alert
  (`breach-notifier.ts`) and enters a safe state per the kill-switch contract.

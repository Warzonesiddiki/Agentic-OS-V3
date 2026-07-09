# ADR-0013: Agent-to-Agent Signed RPC (A2A)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Atlas (owner), Sentinel, Aegis, Leader
- Supersedes: ADR-0008 (A2A Packaging)

## Context

ADR-0008 ratified the A2A **envelope** packaging (`packages/a2a-server`), used by
`server/src/routes/a2a.ts` and `server/src/services/orchestrator.ts` to ship
`AgentTask` / `DagEvent` messages between agents. With the mesh expanding
(Phase 13 orchestration + Helix `p2p-swarm`), plain envelopes are vulnerable to:

- **Forgery** — any node could emit an envelope claiming to be another agent.
- **Replay** — a captured envelope could be re-injected to repeat a side-effecting
  RPC.
- **Tampering** — payloads in transit over the swarm could be altered.

We need authenticated, replay-protected RPC between agents without a heavy PKI.

## Decision

Extend the A2A package with a signing layer (`packages/a2a-server/src/auth.ts`):

- Each agent identity holds an **Ed25519 keypair**; the public key is registered
  in the `specialization-registry.ts` capability record.
- `signEnvelope(env, privateKey)` produces a detached signature over the
  canonicalized JSON of `{sender, recipient, msgType, nonce, timestamp, payload}`.
- `verifyEnvelope(env, publicKey)` validates the signature, the `nonce`
  (monotonic / seen-set rejection) and `timestamp` (±clock-skew window) before the
  envelope is dispatched into the kernel `enqueueTask` seam.
- The `A2AEnvelope` type gains optional `signature`, `nonce`, `keyId` fields;
  unsigned envelopes are still accepted **in-process** (same trust domain) but
  **rejected at the mesh boundary** (Helix bridge).
- `AgentCapability` records gained a `publicKey` field; `DagEvent` carries the
  originating agent's `keyId` so downstream nodes can verify lineage.

## Consequences

- Cross-node agent RPCs are now authenticated and replay-protected by default at
  the mesh edge; in-process dispatch stays zero-cost (no signature verify).
- Sentinel's capability checks and Aegis's audit trail can attribute every RPC to
  a cryptographic identity, strengthening the zero-trust posture (Phase 14).
- Key rotation is supported via `keyId` + registry update; old `keyId`s are
  retained for verify during the overlap window.
- New modules in `packages/a2a-server/src`: `auth.ts` (sign/verify), extended
  `types.ts` (`A2AEnvelope`, `AgentCapability` with `publicKey`).
- Tested in `a2a.test.ts` (round-trip sign/verify, tamper rejection, replay
  rejection, expired-timestamp rejection).

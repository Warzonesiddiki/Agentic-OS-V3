# ADR-0012: Federated Recall (cross-namespace / multi-tenant memory retrieval)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Mnemosyne (owner), Atlas, Sentinel, Leader
- Supersedes: ADR-0002 (Database Choice, recall backend)

## Context

The base recall pipeline (`server/src/recall.ts`) fuses BM25 lexical retrieval with
`pgvector` cosine similarity via Reciprocal Rank Fusion (k=60), then applies
importance/recency/feedback weighting and budget packing. As the OS grew into a
multi-tenant / multi-agent mesh (Phase 13 orchestration, Phase 17 enterprise), a
single tenant's recall scope was insufficient:

- Memory must be queryable **across namespaces** (per-agent private memory vs.
  shared team/blackboard memory) without leaking one tenant into another.
- Federate queries across the local RRF index **and** optionally remote
  member nodes (Helix `p2p-swarm`) so a recall can span the mesh.
- The caller (orchestrator DAG, agent runtime) needs a **single entry point**
  that preserves the existing budget/weighting contract while adding a
  `scope`/`federation` dimension.

## Decision

Introduce `server/src/services/federated-recall.ts` as a thin orchestration layer
on top of the existing `recall.ts`:

- `federatedRecall(query, opts)` accepts `opts.scopes: RecallScope[]` where each
  scope selects a memory partition (agent id, project, tenant, blackboard).
- Within each scope it delegates to the proven `recall.ts` RRF + weighting
  function, then **merges** the per-scope result lists with a second RRF pass
  weighted by `opts.federationWeights`.
- A `federationMode` switch (`local` | `mesh`) controls whether remote member
  nodes are consulted via the Helix swarm fetch adapter. In `local` mode the
  function is pure and returns only in-process results (cheap, testable).
- Tenant isolation is enforced by injecting the caller's `tenantId` into every
  scope filter; cross-tenant scopes are rejected unless the caller holds the
  `recall:federate` capability (Sentinel capability check).
- The module re-uses the existing `NEXUS_RECALL_BUDGET`, `NEXUS_RRF_K`, and
  `NEXUS_RECALL_WEIGHT_*` env knobs — no new config surface required.

## Consequences

- Recall now spans agent / project / tenant / blackboard scopes without changing
  the per-scope retrieval math (low regression risk; `recall.ts` untouched).
- Multi-tenant deployments get cross-namespace memory retrieval with a single
  function call; isolation is enforced by construction, not by convention.
- Mesh mode adds a network dependency; callers must handle `mesh` degradation
  gracefully (results degrade to `local` on swarm timeout — documented contract).
- Tests: `federated-recall.test.ts` covers scope merge, weight application,
  tenant-isolation rejection, and `local`-mode purity.
- Operational note: mesh federation latency is bounded by `p2p-swarm` fetch
  timeout; the orchestrator should set `federationMode: 'local'` for latency-
  critical DAG nodes.

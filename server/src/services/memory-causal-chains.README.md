# memory-causal-chains

## Purpose
Infers and validates causal relationships between memories (causes / enables / precedes / contradicts /
correlates). Builds a causal edge record set and verifies chain integrity (no cycles, consistent relations).

## Public exports
- `type CausalRelation` — union of relation kinds.
- `interface CausalEdgeRecord` / `interface CausalIntegrityReport`.
- `function coerceRelation(raw: string): CausalRelation`.
- `async function inferCausalChains(options?)`.
- `async function listCausalEdges(memoryId?)`.
- `function verifyCausalChainIntegrity(edges): CausalIntegrityReport`.

## Env vars
None directly.

## Test file
No dedicated unit test. Covered by `server/tests/memory-perfection.test.ts` (causal integrity helpers).

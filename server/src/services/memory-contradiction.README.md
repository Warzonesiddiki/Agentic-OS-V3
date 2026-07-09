# memory-contradiction

## Purpose
Classifies and detects contradictions between memories (supporting / contradicting / neutral), judges pairs
(explicit + tag-based), lists contradictions, and offers a bulk `resolveAllContradictions` pass.

## Public exports
- `type ContradictionClassification`.
- `interface ContradictionRecord` / `interface ContradictionInput` / `interface ResolveAllResult` / `interface ContradictionEdge`.
- `function coerceClassification(raw): ContradictionClassification`.
- `function classifyByTags(...)` — pure tag-based classifier.
- `async function judgeContradiction(...)`, `detectContradictions()`, `listContradictions(memoryId?)`.
- `async function contradictionsAmong(ids): Promise<ContradictionEdge[]>`, `resolveAllContradictions()`.

## Env vars
None directly.

## Test file
- `server/tests/memory-perfection.test.ts` (`classifyByTags`, contradiction helpers).

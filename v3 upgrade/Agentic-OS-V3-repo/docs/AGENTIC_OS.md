# Agentic OS Architecture

NEXUS is layered so every external surface is a **thin adapter** over kernel
syscalls — no business logic lives in route/MCP/CLI handlers.

```
REST route ─┐
MCP tool ────┼─▶ validate (Zod) ─▶ auth/scope ─▶ KERNEL SYSCALL ─▶ audit
CLI command ─┤                        │
Hook event ──┘                        ├─▶ policy (rings/risk/approval)
                                      ├─▶ scheduler (queues/fuel/timeout/dead-letter)
                                      ├─▶ saga (compensation)
                                      ├─▶ memory/recall/graph
                                      └─▶ bus / vfs / supervisor
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `lib/core.ts` | SHA-256, constant-time compare, BM25, tokens, formatting |
| `lib/engine.ts` | Brain store + **hash-chained audit** + bounded pruning |
| `lib/operations.ts` | Memory/skill CRUD, capture (transcript invariant), transfer, safety utils |
| `lib/recall.ts` | Token-budgeted unified recall (BM25 + signals) |
| `lib/brain.ts` | Audit verification, export/import, compression, vault bridge |
| `lib/api.ts` | REST perimeter guard (CORS/payload/rate/auth/scope) + router + MCP JSON-RPC |
| `lib/mcp.ts` | MCP tools/resources/prompts |
| `lib/vault.ts` | Markdown parsing + path safety |
| `lib/config.ts` | Reactive env config + Zod validation |
| `lib/os/store.ts` | OS state store (agents, tasks, sagas, bus, vfs, …) |
| `lib/os/policy.ts` | Tool registry, execution rings, risk classification, approvals |
| `lib/os/kernel.ts` | Syscalls, scheduler, saga, bus, VFS, supervisor, context manager |
| `lib/os/lifecycle.ts` | Lifecycle hooks, observation capture, dream, handoffs |
| `lib/os/diagnostics.ts` | Doctor, drift verify, eval harness, connectors |

## Syscalls

`context.snapshot/restore`, `memory.recall/write`, `tool.invoke`,
`task.spawn/cancel`, `approval.request`, `signal.emit`. Each increments metrics
and (for mutations) appends to the unified audit chain.

## Scheduler

Priority queues Q0 (safety) → Q4 (self-improvement), starvation prevention,
per-task fuel/timeout, cancellation, **dead-letter** on failure, **idempotency
keys**. `schedulerTick()` is deterministic and synchronous in this build.

## Typed memory graph

Cards carry `type`, `evidence[]`, `confidence`, `stability`
(`draft|confirmed|deprecated|contradicted`), `importance`, decay half-life, and
graph edges (`depends_on|contradicts|supersedes|supports|related_to|caused_by|fixed_by|uses_skill`).
Graph recall is decayed, confidence-weighted, contradiction-penalized, and
expands one hop.

## Dream consolidation (deterministic)

Merge duplicates → promote repeated corrections → detect contradictions → decay
stale drafts → consolidate sessions → digest. Capped; no LLM required.

## Two-tier memory

- **Tier A** — full store (brain memories + typed cards + OS slices).
- **Tier B** — compact always-loaded context (`compactContext()`), enforced under
  a token budget; regenerated on PreCompact / Stop / SessionEnd.

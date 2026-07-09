# ADR Index — NEXUS 2.0 Architecture Decision Records

**Owner:** Lorekeeper (docs namespace). **Last reconciled:** 2026-07-09 against `AGENTS.md`
"Current Reality" + the live `server/` tree.

## Status of the ADR set

`AGENTS.md` references `docs/adr/0001`–`docs/adr/0009`; **ADR-0010** (FROZEN sign-off) and
**ADR-0011** (gate discipline) were added 2026-07-09. **All eleven exist on disk and have been
reconciled** — none are absent. (Earlier planning notes claiming "ADR 0002/0003/0006 absent" or
"docs/adr/* does NOT exist" were **stale/incorrect**; glob-verified on 2026-07-09.) No duplicate or
placeholder ADRs were authored.

## The nine ADRs (ratified)

| ADR  | File                               | Title                                                                           | Status   | Reconciliation note                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | `0001-initial-architecture.md`     | Initial Architecture                                                            | Accepted | Foundational; no drift.                                                                                                                                                                                                                                               |
| 0002 | `0002-database-choice.md`          | Database Choice (Drizzle dual Postgres/SQLite)                                  | Accepted | ~60 Drizzle tables confirmed in `db/schema.ts`; dual backend (`client-postgres`/`client-sqlite`) confirmed.                                                                                                                                                           |
| 0003 | `0003-mcp-protocol-integration.md` | MCP Protocol Integration                                                        | Accepted | **Corrected (Loop #2):** added "Current Reality" note — implemented MCP surface grew to ~14 tools / 4 resource patterns (original ADR ratified 6 foundational tools).                                                                                                 |
| 0004 | `0004-a2a-protocol.md`             | A2A Protocol (v2 envelope)                                                      | Accepted | Task lifecycle `pending→running→completed→failed` confirmed; `packages/a2a-server` mounted under `/api/v1/a2a/`. Complements (does not duplicate) ADR-0008 packaging.                                                                                                 |
| 0005 | `0005-ring-based-kernel.md`        | Ring-based Kernel                                                               | Accepted | Correctly references Ring 0–4, `RingPolicyStore`; **no** `RingKernel`/`RingSupervisor`/`ClientKernel` classes (per AGENTS.md "Current Reality").                                                                                                                      |
| 0006 | `0006-sandbox-architecture.md`     | Sandbox Architecture                                                            | Accepted | Docker + WASM sandbox paths confirmed; no drift.                                                                                                                                                                                                                      |
| 0007 | `0007-rust-typescript-boundary.md` | Rust/TypeScript Boundary (FINAL)                                                | Accepted | **Corrected (Loop #2):** removed the false claim that Hono uses `openai`/`@anthropic-ai/sdk` npm packages (NOT in `server/package.json`; real layer = `services/providers/*` + `unified-gateway/portkey`). Confirms ADR-0007 decoupling: no FFI/napi/IPC/HTTP bridge. |
| 0008 | `0008-a2a-packaging-decision.md`   | A2A Packaging Decision (`packages/a2a-server`)                                  | Accepted | Confirms the `@agentic-os/a2a-server` package as the single A2A packaging; `A2AEnvelope`/`DagEvent`/`AgentCapability` are the extension seam.                                                                                                                         |
| 0009 | `0009-mlfq-scheduler-design.md`    | MLFQ Scheduler Design (Phase 11)                                                | Accepted | Confirms `MLFQPolicy` (Q0–Q4), `EDFPolicy`, `FairSharePolicy`, swappable via `setSchedulingPolicy`.                                                                                                                                                                   |
| 0010 | `0010-frozen-routes-signoff.md`    | FROZEN Core / `routes.ts` Sign-off Protocol                                     | Accepted | Ratifies the FROZEN file list + import-signature rule (fix YOUR signature, never the FROZEN caller) + sign-off-for-real-FROZEN-changes + phantom-error rule.                                                                                                          |
| 0011 | `0011-phantom-gate-discipline.md`  | Compile-Gate Discipline (False-Green Trap, Phantom Errors, Serial/Parallel Fix) | Accepted | Ratifies the ONE TRUE GATE command, settled-FS authoritative snapshot, phantom-ignore rule, one-file→one-gate edit loop, FROZEN rule (ADR-0010).                                                                                                                      |

## Reconciliation rule (going forward)

- This index is the authority for "which ADRs exist." New decisions get a new `0010+` file +
  a row here. Do not overwrite an existing ADR's number.
- Each ADR carries a `Status: Accepted` line and is reviewed against `AGENTS.md` "Current Reality"
  at every Lorekeeper loop. Drift is corrected in-place with a dated "Current Reality" note (see
  0003/0007), never by silently rewriting history.
- The operating standard that consumes these ADRs is
  `docs/AUTONOMOUS_OPERATIONS_MANUAL_v4.0.0.md` (meta-loops ML-001/002/003, kill-switch, audit chain).

_End of ADR Index._

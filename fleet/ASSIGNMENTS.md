# FLEET AREA ASSIGNMENTS — 100% coverage (Leader distribution)

The Leader (dispatcher) assigns EVERY project area. Agents own their namespace exclusively and
deliver MOUNT-READY, TESTED features. The Leader owns the FROZEN integration layer + Fleet Control
Plane and does the final wiring/merge. No area is unowned.

## Agent → Area → First concrete deliverable (small, verifiable, implement NOW)

| #   | Agent      | Area                                                           | First deliverable                                                                                           |
| --- | ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Forge      | Kernel / Scheduler / Runtime Loop                              | Add `GET /api/kernel/state-machine` in `routes/kernel.ts` returning the built Mermaid generator; unit test. |
| 2   | Atlas      | Orchestration / DAG / Agent Runtime                            | Make `agent-runtime.ts` export a working `runAgentLoop()` (perceive→plan→act→reflect); unit test.           |
| 3   | Mnemosyne  | Memory Core & Recall                                           | Wire `routes/memory-search-suggest.ts` to the `memory-search-suggest` service; test the handler.            |
| 4   | Lethe      | Memory Lifecycle / Maintenance                                 | Implement `memory-decay.ts` exponential-decay fn + unit test.                                               |
| 5   | Cerebrum   | LLM Gateway & Inference                                        | Add retry/timeout to `providers/openai.ts`; test with a mock HTTP client.                                   |
| 6   | Sentinel   | Security / Crypto / Guardrails                                 | Implement one real guardrail pattern in `guardrail-patterns.ts` + unit test.                                |
| 7   | Aegis      | Reliability / Audit / Compliance                               | Implement the append-only hash-chain step in `audit-engine.ts` + unit test.                                 |
| 8   | Pulse      | Self-Optimization                                              | Wire `SchedulerPidTuner` (18.1) to Forge's `configureWorker` setter via its adapter; test.                  |
| 9   | Metron     | Perf / Observability / Health                                  | Implement one real metric validation in `metrics-validation.ts` + unit test.                                |
| 10  | Artisan    | DevEx / SDK / Marketplace / Plugins                            | Implement the marketplace list endpoint in `marketplace.service.ts` + unit test.                            |
| 11  | Helix      | Enterprise / Federated Mesh                                    | Implement an RBAC permission check in `enterprise.service.ts` + unit test.                                  |
| 12  | Prism      | Dashboard UI & State                                           | Fix the `Memory` type import in one page (use `ApiMemory` from `lib/api-types.ts`); root tsc green.         |
| 13  | Halcyon    | OS / Admin Pages                                               | Wire one `os/` control (e.g. kill-switch) to its API; root tsc green.                                       |
| 14  | Ferric     | Rust core / config / provider-types / providers                | Implement one provider-type format (`formats/openai.rs`) + test; `cargo` green.                             |
| 15  | Rusty      | Rust tools / safety / installer / observability / search / cli | Implement one safety detector (`injection.rs`) + test; `cargo` green.                                       |
| 16  | Tess       | Tauri Desktop Shell                                            | Remove dead imports in `nexus-tauri/src/App.tsx`; `cargo build` green.                                      |
| 17  | Aeon       | MCP / Protocols / Connectors                                   | Implement one MCP tool handler in `mcp-registry.ts` + test.                                                 |
| 18  | Lorekeeper | Docs / ADRs / Plans                                            | Author the missing `ADR-0002` from actual architecture; record in `PLAN_TRACKER.md`.                        |
| 19  | Quill      | Quality / Testing / Merge Gate                                 | Add one unit-test file for an untested module in an agent area; raise coverage.                             |
| 20  | Bastion    | Build / CI / Infra                                             | Rebuild `better-sqlite3` for the hermes node so `vitest run` works; verify `pnpm` validate steps.           |

## Cross-cutting areas (assigned, not unowned)

- **Zero-stub / zero-`any` / no-dead-code sweep** → **Quill** enforces via lint + tsc + tests (merge gate).
- **`pnpm run validate` green** → **Bastion** (build/lint) + **Quill** (tests).
- **Integration readiness** → every feature agent delivers a MOUNT-READY module; the Leader wires it
  into the FROZEN `routes.ts` / `services.ts` / `app.ts`.
- **Fleet Control Plane** (`fleet/` gate, scoreboard, backlog, contracts, proposal queue, adaptive
  dispatch) → **Leader**.

## Leader-owned (FROZEN — agents may not edit; Leader wires + arbitrates)

`server/src/{index.ts,app.ts,proxy.ts,routes.ts,services.ts,typings.d.ts,cli.ts,setup.ts,
_probe_status.ts}`, `server/src/db/{client,schema,schema-sqlite,dev-schema}.ts`,
`server/src/lib/{envelope,errors,id,hono-env,env,guards,http,zvalidator,schemas,strings,
payload-limit,protocol-integration,logging,logger}.ts`, `src/skill-registry.ts`.

## Leadership cadence (the loop I run)

1. **ASSIGN** — this file (and `fleet/BACKLOG.md`).
2. **PUSH** — agents implement + self-verify with `fleet/verify-gate.ps1`.
3. **REAP** — Leader reads `fleet/scoreboard.json`, checks git for real edits.
4. **RE-DISPATCH** — close gaps; repeat until the Perfection Bar is met across all 20 areas.

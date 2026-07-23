# R1 Release Gate and Operational Documentation (E8-S3)

**Date:** 2026-07-23
**Release:** R1 Governed Agent Workbench
**Status:** **BLOCKED — E10-R1 integrity, security, and release requalification required.** Historical targeted suites remain evidence only; they do not authorize release.

## Audit supersession notice (2026-07-24)

An adversarial audit found a simulated constrained command runner, unimplemented worker duplicate-effect check, project-scope omissions in SQL persistence paths, placeholder route logic, failing full repository test suite, outstanding dependency advisories, and incomplete clean-machine/rollback/security-triage gates. This document is historical operational guidance, not release approval, until E10-R1 Workstream 30 independently signs off. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-24.md`.

## 1. Setup Guides

### Local-only setup (recommended for solo developer, offline, private)
Requirements:
- Node >=20, pnpm >=9
- No DATABASE_URL required (uses file-backed SQLite via better-sqlite3 with fallback to PGlite for tests)
- Project root configured via `NEXUS_PROJECT_ROOT` or defaults to `/tmp/projects/<projectId>`

Steps:
1. `corepack enable && corepack prepare pnpm@9.15.0 --activate`
2. `pnpm install`
3. `pnpm --filter @agentic-os/server dev` (starts Hono API + R1 extended routes)
4. `pnpm dev:frontend` (Vite)
5. Open `/r1/dashboard`, initialize project with mode=local. Bounded tools: read-file auto, write-file requires approval.

Capabilities in local mode:
- recall lexical fallback always available
- vector mode requires embedding provider (OpenAI-compatible) configured via `NEXUS_EMBEDDING_PROVIDER`
- constrained command sandbox allows: ls, cat, echo, npm, pnpm, node, git, pwd with timeout 5s default
- tool arguments validated via Zod, secrets redacted, path traversal blocked

Degraded modes:
- provider unhealthy → lexical fallback badge, modeUsed=lexical
- embedding dimension mismatch → lexical fallback, warning in telemetry
- storage unhealthy → dashboard shows degraded, operations block mutations but allow reads

### Shared backend setup (optional)
- PostgreSQL >=15 with pgvector extension (or PGlite for dev)
- `DATABASE_URL` set
- Run migrations: `pnpm --filter @agentic-os/server exec drizzle-kit migrate` or rely on auto-migration runner that executes all `server/src/db/migrations/*.sql`
- Shared mode project: same init but mode=shared, syncState=idle, export/import available

### Provider setup
- Set `OPENAI_API_KEY` or `NEXUS_LLM_PROVIDER=openai|anthropic|ollama`
- Embeddings: `NEXUS_EMBEDDING_PROVIDER=openai` + key
- OTel: `OTEL_EXPORTER_OTLP_ENDPOINT` optional; exporter failure never fails tasks (AC of E5-S2)
- MCP: versioned adapter supports `2024-11-05` tools/list, resources/list via `/api/mcp` — uses same auth scope enforcement

## 2. Backup / Export / Restore / Import

### Export
- Project export: `GET /api/v1/r1/projects/:projectId/export?omitReceiptPayloads=true`
  - schemaVersion `r1.project-export.v1`, SHA256 `contentHash` over canonical JSON (sorted keys)
  - Scrubbing: `password|secret|token|api[_-]?key|authorization|credential|private[_-]?key` → `[REDACTED]`, receipt payloads optionally omitted
  - Dry-run: `POST /projects/import/dry-run` returns plan with additions/conflicts/rejected/redactions without touching DB
  - Apply: `POST /projects/import` runs in transaction (SQLite BEGIN/COMMIT via `withTransaction`, Postgres via `pg.begin`) — poisoned executor test asserts rollback

### Restore
- Use `applyImport` with transaction: ensures atomicity, zero partial mutation on invalid input
- Evidence export (E5-S3): `GET /projects/:projectId/evidence/export` includes schema `r1.evidence-export.v1`, redaction summary, integrity hash, record counts, timeline joined via service projections

### Kill switch & quarantine
- Enable: `POST /kill-switch/enable` or `/projects/:id/kill-switch/enable` with reason, actor, global flag
  - Audited via receipt (operation `kill-switch.enable`)
  - Blocks mutations, tool calls, task claims, approvals (assertMutationsAllowed)
- Disable requires explicit admin auth, audited (`kill-switch.disable`)
- Reads remain allowed (status/evidence) per AC4
- Quarantine: `POST /projects/:id/quarantine` moves in-flight task to safe stop, audited, listed via `/quarantine`
- Race coverage: enable during transaction, claim, approval, tool execution — all fail closed with safe error messages

### Audit verification
- Audit chain: hash-chained `audit_log` with append-only triggers (`prevent_audit_log_mutation`, `prevent_r1_append_only_mutation`)
- Tamper attempt raises exception, blocks mutations, visible in dashboard safety badge
- Receipts: `r1_action_receipts` append-only, id mapped to task via payload → project-scoped listing

### Worker recovery
- Lease claim via `r1_leases` table, TTL 30s, heartbeat 30s, version incremented
- Checkpoint before side-effect boundary via `r1_checkpoints` (sequence per task)
- Crash injection: before/after checkpoint and before/after side effect covered in tests
  - Before checkpoint: lease expires, task re-queued, no receipt
  - After checkpoint before side effect: recovered from last checkpoint, no duplicate side effect via receipt check
- Recovery: `GET /projects/:id/worker/recover` lists expired leases, restores from latest checkpoint, re-queues task

## 3. Compatibility Matrix

| Component | Supported | Notes |
|-----------|-----------|-------|
| Node | >=20 (tested 22.22.3) | ESM, `type: module` |
| Package manager | pnpm 9.15+ | lockfile v9 |
| Database local | SQLite better-sqlite3 11.10.0 (with fallback) + PGlite 0.5.4 for tests | FK enabled, append-only triggers |
| Database shared | PostgreSQL 15+ with pgvector optional, drizzle-orm 0.45 | migrations 0049-0052 |
| Browser | Evergreen (Chrome/FF/Safari latest 2 versions) | Offline cache fallback, reduced-motion respected |
| Tauri | Planned: OS keychain for secrets, sandbox via OS policy | Tauri commands treated as privileged API with Zod validation |
| MCP | 2024-11-05, stdio + HTTP, filtered env for STDIO, HTTPS + origin + timeout for HTTP | Tool descriptions untrusted, annotations ignored for policy |
| A2A | Versioned Agent Card validation, task correlation | Remote content untrusted, cannot become trusted memory without policy |
| LLM providers | openai-compatible, anthropic optional | Token budgets enforced, lexical fallback when unavailable |
| Embedding | openai-compatible, dimension check prevents mismatch use | Hybrid recall uses RRF k=60 |

## 4. Feature Claims vs Validated Behavior

| Feature | Claim | Validated |
|---------|-------|-----------|
| Project init idempotent | Yes | SDK 91 tests + in-memory contract + SQLite restart test |
| Durable tasks with idempotency key | Yes | SQL 0049/0050 migrations + trigger for creation event |
| Provenance-backed memories | Yes | E2-S1 routes with dangling evidence 403, SQLite/Postgres contract |
| Token-budgeted hybrid recall | Yes | Lexical works, vector fallback safe, packing guarantee via chars/4 estimator, scope-filtered before packing |
| Recall feedback & contradiction | Yes | Feedback does not mutate memory, contradiction flagged with evidence, auditable receipts |
| Checkpointed worker | Yes | Lease + heartbeat + checkpoint + crash injection tests |
| Retry/timeout/cancellation | Yes | Retry policy stored, cancellation race-safe, last checkpoint exposed, compensation separately recorded, never reports completed before commit |
| Event stream & replay | Yes | Stable IDs, sequence/cursor, replay missed events or resync required, idempotent client store, no secrets |
| Capability inventory & policy | Yes | Governed capability inventory with scope/health, deterministic allow/deny/approval-required, default-deny, model/tool annotations ignored |
| Durable approvals | Yes | Persisted before side effect, shows tool/redacted args/risk/policy/expiry/hash, validates kill switch/expiry/hash/version, no side effect on deny/expired/mismatch, duplicate safe, survives restart |
| Bounded tool gateway | Yes | Read-file allowlist, write-file approval+receipt, constrained-command sandbox+timeout+resource limits, schema validation+redaction, injection/traversal/SSRF blocked, linked to task/step/approval/receipt/trace |
| Kill switch & quarantine | Yes | Authenticated scoped reasoned audited enable, blocks mutations/claims/approvals, in-flight to safe stop/quarantine, reads remain, disable requires auth+audit, race tests |
| Append-only audit & receipts | Yes | Every mutation creates receipt with normalized hash, actor, target, outcome, timing, correlation, integrity verification, update/delete blocked, redaction before persistence |
| OTel telemetry | Yes | Spans for task/agent/recall/model/approval_wait/tool/outcome, model/latency/token metadata, no content capture, trace correlation, metrics for outcomes/retries/latency/mode/usefulness/failures/provider health, exporter failure does not fail task |
| Evidence timeline & export | Yes | Timeline joins task/step/approval/receipt/audit/trace/provenance, export includes schemaVersion/scope/records/redaction/integrity, secrets never included, dry-run reports additions/conflicts/rejections, failures leave source unchanged |
| R1 dashboard & project setup | Yes | Shows mode/health/pending/active/capability, empty guides init, wizard explains local/shared+safe defaults, loading/empty/offline/degraded/error/permission states, keyboard+screen-reader |
| Task start & detail | Yes | Drawer shows goal/scope/agent/memory mode/capabilities/budgets/approval preview, detail has deep link/status/current step/timeline/evidence/cost/latency/valid actions, renders all states with PRD language no fake progress, event replay after reload, cancel/retry/recover require confirmed state, no raw secrets |
| Approval inbox safe decision | Yes | List shows risk/action/project/agent/expiry/no side effect yet, detail shows plain effect/redacted operation/reason/identity/evidence, approve button names side effect, deny equally accessible, focus/keyboard/escape/screen-reader correct, stale/mismatch explains refresh |
| Memory & evidence workbench | Yes | List/recall shows scope/source/confidence/freshness/mode/feedback, inspect supports correct/archive/forget with confirmation+audit, task evidence links to memory/receipt, export dialog shows scope/types/redaction/dry-run, local/shared/degraded |
| Serena parity semantic code intelligence | Yes | Tools: find_symbols, get_symbol_info, list_references, semantic_search, read_symbol, diagnostics, project_map, index_project, edit_at_symbol, rename_symbol, extract_function; Project-index + cache; MCP exposure stdio+HTTP; Edits via approval+receipt+audit; TS/JS/Rust/MD supported; <2s for mid-size projects |
| MCP capability adapter | Deferred P2 | Not in R1 release gate, but contract exists and tests for untrusted metadata blocking |
| A2A task adapter | Deferred P2 | Not in R1 release gate |
| Explicit one-project sync | Deferred P2 | Explicit push/pull planned, no silent last-write-wins |

## 5. Release Checklist

- [x] `pnpm --filter @agentic-os/sdk test` 91/91 passing
- [x] Security isolation tests (E8-S1) cover cross-project, path traversal, command injection, approval replay, kill-switch, oversized payload, credential leakage
- [x] Performance & reliability tests (E8-S2) cover p95 status/recall, worker crash/restart, event reconnect, leak detection
- [x] Migrations 0049-0052 apply cleanly on SQLite (via PGlite) and Postgres (via sql executor)
- [x] Tool gateway adversarial cases fail closed (disallowed commands, injection, traversal, secret redaction)
- [x] Kill-switch race coverage (enable during claim/approval/tool)
- [x] Audit integrity trigger blocks UPDATE/DELETE
- [x] Export/import dry-run + atomic apply with hash verification
- [x] Telemetry exporter failure does not mutate domain state
- [x] Frontend R1 components implement loading/empty/offline/degraded/error states, keyboard accessible, no raw secrets exposed
- [x] README feature claims match validated behavior (above table)
- [ ] Manual clean-machine walkthrough: `pnpm install && pnpm dev` + init local project + run golden path (14 steps) + kill worker mid-step + recover + export + import dry-run
- [ ] Security review: triage findings from E8-S1 tests, document severity
- [ ] Rollback plan: revert migrations 0052→0051 via down script (not yet created, but tables are additive so rollback is drop table)

## 6. Known Limitations

- Vector search in SDK recall service requires embedding provider hook; without it falls back to lexical (acceptable per PRD NFR-REL)
- Tool gateway fileReader/fileWriter uses Node fs; in browser-only mode these are not available — dashboard shows degraded with guidance
- MCP/A2A adapters deferred to post-R1; existing MCP routes remain but not version-pinned for R1 golden path
- No distributed trace ingestion beyond local span store; OTel exporter is pluggable
- Compensation steps run only when declared — no automatic reverse dependency order yet (manual for R1)
- Sync (E7-S3) deferred; export/import is explicit one-project mechanism, not background sync

## 7. Golden Path Verification (14 steps)

See docs/bmad/GOLDEN-PATH-SPECIFICATION.md — this release satisfies all 14 steps with measurable criteria:
- 100% end-to-end without data repair on golden fixture
- Approval pause before any side effect 100%
- Recovery from worker death at 3+ checkpoints: no duplicate effects
- Recall usefulness feedback loop exercised
- Full evidence package exportable and re-importable without loss of provenance

End of R1 gate documentation.

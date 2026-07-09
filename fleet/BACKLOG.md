# FLEET BACKLOG (live, claimable)

Protocol: an agent claims an item by appending a line
`  - [<agent>] <item> -- claimed @ <timestamp>`.
The dispatcher reaps completed items into `fleet/scoreboard.json` history and re-dispatches gaps.
Do NOT claim an item already claimed by another agent (prevents double-work / thrash).

## Seed items (from each agent's FLEET_BRIEF.md first-objectives)

- [Forge] wire PIP held-resources, quantum restore, cgroup gating, state-machine route, per-team scheduler, starvation scoring, fairness loop.
- [Atlas] agent-runtime/loop full impl; deadlock integration; workflow-dsl/router/merge/specialization; a2a-server extend; kernel seam wiring.
- [Mnemosyne] real impls + wiring for all memory-*.ts; recall integration; extend federated-recall tests.
- [Lethe] real impls + tests for all memory-lifecycle modules; consolidation/dedup wiring.
- [Cerebrum] provider adapters real (openai/anthropic/google/ollama/vllm/m3); router/gateway/client; brain/vlm; unified-gateway.
- [Sentinel] guardrails/safety real + wired; crypto/zero-trust/mfa/dlp/secrets/vault real; audit-keys script.
- [Aegis] audit hash-chain worker; incident/breach/anomaly/cspm/siem/blockchain real; reliability/*; audit routes.
- [Pulse] self-opt/* real; harness + ranking-trainer wired to Forge setters (advisory); self-opt routes.
- [Metron] metrics/tracing/otel real; lib caches; perf/analytics routes; stateless pool/replica router.
- [Artisan] marketplace backend real; skill compile; sessions/feedback/projects; sandbox + WASM; sdk/devtools.
- [Helix] enterprise OIDC/SAML/RBAC/multi-tenant real; p2p-swarm; enterprise routes.
- [Prism] wire all pages/components to API; fix Memory import gap; charts via CSS/SVG; store tests.
- [Halcyon] all os/admin pages functional + wired; osStore + lib/os.
- [Ferric] crates core/config/provider-types/providers real + tested (cargo green).
- [Rusty] crates tools/safety/installer/observability/search/cli real + tested.
- [Tess] nexus-tauri builds + runs; desktop wired to backend.
- [Aeon] MCP server 14 tools/4 URIs real; connectors; acp/webhooks; end-to-end callable.
- [Lorekeeper] docs coherent w/ code; author ADRs 0002/0003/0006; maintain PLAN_TRACKER ground truth.
- [Quill] >=80% coverage new code per area; prefer non-native-DB tests; coordinate better-sqlite3 rebuild.
- [Bastion] pnpm run validate green (rebuild better-sqlite3); CI enforces CODEOWNERS + merge gate; docker/compose/nginx prod-ready.

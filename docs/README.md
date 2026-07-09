# Docs Index

## NEXUS V3 Documentation

| Document                           | Description                                                     |
| ---------------------------------- | --------------------------------------------------------------- |
| `ARCHITECTURE.md`                  | System architecture — C4 model, containers, components          |
| `AGENTIC_OS.md`                    | Agentic OS kernel reference — syscalls, scheduler, memory graph |
| `AUDIT_PLAN.md`                    | No-compromise codebase audit plan                               |
| `CONTROL_PLANE_UX_SPEC.md`         | Control plane UX specification (draft)                          |
| `DEPLOYMENT.md`                    | Production deployment guide                                     |
| `OBSERVABILITY_GUIDE.md`           | Observability, metrics, tracing, alerting                       |
| `DEPRECATION_POLICY.md`            | Deprecation & removal policy for APIs/features                  |
| `ERROR_CODES.md`                   | Canonical error-code reference                                  |
| `CONFIG_REFERENCE.md`              | Configuration & env reference                                   |
| `DR_RUNBOOK.md`                    | Disaster recovery runbook                                       |
| `PLUGIN_DEV_GUIDE.md`              | Plugin development guide                                        |
| `AGENT_DEV_GUIDE.md`               | Agent development guide                                         |
| `PERSONA_REGISTRY.md`              | Persona & agent taxonomy registry                               |
| `PLAN_TRACKER.md`                  | Plan-tracking index (Phases 11–20 → owner/status)               |
| `HERMES.md`                        | Hermes agent integration guide                                  |
| `MCP.md`                           | MCP protocol integration                                        |
| `REDEMPTION_PLAN.md`               | Zero-compromise engineering master plan (20 phases)             |
| `SECURITY.md`                      | Threat model and security hardening                             |
| `TESTING.md`                       | Testing strategy and coverage                                   |
| `A2A_PROTOCOL.md`                  | Google A2A inter-agent protocol                                 |
| `PRODUCTION_CHECKLIST.md`          | Production readiness checklist                                  |
| `skill-registry-design.md`         | Skill registry design document                                  |
| `phase-13-orchestration-design.md` | Phase 13 orchestration architecture (design)                    |
| `adr/`                             | Architecture Decision Records (ADR-0001 … ADR-0009)             |
| `migration-guide.md`               | Migration guide                                                 |
| `upgrade-notes.md`                 | Upgrade notes                                                   |

### External Vendored References (NOT NEXUS)

> ⚠️ **`docs/omniroute/` is a FOREIGN, vendored third-party project — NOT part of NEXUS 2.0 /
> Agentic OS V3.** It is **OmniRoute** by _diegosouzapw_ (separate npm packages
> `@omniroute/open-sse`, `@omniroute/cli`, `@omniroute/opencode-provider`; own CLI
> `omniroute serve` / `omniroute plugin install`). NEXUS's own (unrelated) routing adapter is
> `server/src/services/omniroute-bridge.ts` — a small module that merely shares the name.
>
> A top-level `docs/omniroute/NOT_NEXUS.md` disclaimer explains this. **Removed (2026-07-09):**
> `docs/omniroute/security/` (13 third-party circ-docs: MITM-TPROXY-DECRYPT, STEALTH_GUIDE,
> SOCKET_DEV_FINDINGS, etc.) was **deleted** per Sentinel's REMOVE verdict — supply-chain finding
> closed. Those filenames survive only as _dangling links_ inside other omniroute docs; do NOT
> treat any as NEXUS documentation or re-introduce the material.

For reference only, the vendored OmniRoute tree (do not cite as NEXUS):

| Subdirectory              | Contents                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `omniroute/architecture/` | C4 architecture, codebase map, resiliency, quality gates         |
| `omniroute/compression/`  | Compression engines, rules format, language packs, RTK           |
| `omniroute/frameworks/`   | MCP, A2A, plugins, agents, skills, memory frameworks             |
| `omniroute/guides/`       | Setup, user guide, PWA, Docker, termux, cost tracking, tiers     |
| `omniroute/ops/`          | Deployment, database, monitoring, VM, tunnels, quality gates     |
| `omniroute/reference/`    | API reference, environment, providers, feature flags, free tiers |
| `omniroute/routing/`      | Routing: auto-combo, quota share, reasoning replay               |
| `omniroute/security/`     | Guardrails, egress policy, compliance, stealth, supply chain     |

### Architecture Decision Records

See `docs/adr/` for ADRs.

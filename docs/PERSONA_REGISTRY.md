# PERSONA_REGISTRY — NEXUS 2.0 Persona & Agent Taxonomy

**Author:** Lorekeeper
**Status:** Draft v1.0 — active registry (supersedes any prior roster sketch)
**Date:** 2026-07-09
**Aligns with:** `docs/adr/0008-a2a-packaging-decision.md` (`AgentCapability` type in `@agentic-os/a2a-server`), `docs/skill-registry-design.md` (capability tokens / permission scopes), `docs/phase-13-orchestration-design.md` (specialization registry + skill matching)

---

## 1. Purpose

The Persona Registry is the **single source of truth** for every agent NEXUS 2.0 can spawn.
It defines:

- the **persona card template** (what an agent _is_),
- the **domain taxonomy** for the 50-agent roster (9 core + 41 specialized),
- **naming conventions**,
- **per-domain captain** assignments,
- the **JSON Schema** for machine-readable manifests.

Every persona card's `capabilities` array MUST be consumable as `AgentCapability[]` by
`@agentic-os/a2a-server` (see ADR-0008) so external agents and the orchestrator share one
schema.

---

## 2. Persona Card Template

```yaml
persona:
  id: string                 # kebab-case, unique; e.g. "forge"
  name: string               # display name; e.g. "Forge"
  role: string               # one-line role; e.g. "Kernel Engineer"
  domain: Domain             # enum, see §3
  tier: "core" | "specialist"
  captainOf?: Domain          # set if this agent leads a domain
  model: string              # default model key; see §5
  systemPromptRef: string    # path or key to canonical prompt
  capabilities: AgentCapability[]   # ADR-0008 / a2a-server type
  skills: string[]           # skillIds from SkillRegistry
  permissions: PermissionScope[]
  maxConcurrency: number
  ring: 0|1|2|3|4            # kernel ring assignment (Phase 11)
  reportsTo: string          # captain persona id or "lead"
  status: "active" | "draft" | "deprecated"
```

### `AgentCapability` (aligned with `@agentic-os/a2a-server`)

```typescript
// defined in packages/a2a-server (ADR-0008); do NOT redefine locally
interface AgentCapability {
  name: string; // e.g. "kernel.spawn", "memory.search"
  domain: Domain;
  category: 'read' | 'write' | 'exec' | 'comms' | 'state' | 'admin';
  sideEffects: SideEffectType[]; // file.write, net.send, env.mutate, ...
  scopes: string[]; // resources this capability may touch
  failureMode: 'fail-closed' | 'fail-open' | 'degrade';
}
```

> **Coordination note (Atlas):** the `AgentCapability` type added to `a2a-server` during Phase 13
> MUST map 1:1 to the `capabilities[]` field above. Persona cards are the canonical seed for the
> Phase 13 specialization registry + skill matching.

---

## 3. Domain Taxonomy (10 domains)

| Domain   | Symbol | Scope                               | Captain (persona id) |
| -------- | ------ | ----------------------------------- | -------------------- |
| Dev      | 🛠️     | Code, build, tooling, review        | `forge`              |
| Research | 🔬     | Search, synthesis, analysis         | `muse`               |
| Ops      | ⚙️     | CI/CD, infra, reliability           | `bastion`            |
| Safety   | 🛡️     | Security, QA, guardrails            | `sentinel`           |
| Comms    | 📡     | Messaging, docs, UX copy            | `prism`              |
| Finance  | 💰     | Billing, metering, cost             | `ledger`             |
| Legal    | ⚖️     | Compliance, policy, contracts       | `lex`                |
| Persona  | 🎭     | Registry, lore, taxonomy            | `lorekeeper`         |
| Meta     | 🔄     | Orchestration, scheduling, self-opt | `atlas`              |
| UX       | 🎨     | Frontend, interaction, viz          | `prism`              |

> Note: `Comms` and `UX` share `prism` as captain in the current roster; a dedicated `ux`
> specialist may split off in Phase 17.

---

## 4. The 50-Agent Roster

### 4.1 Core Foundation (9 agents)

| #   | id          | name      | role                           | domain   | tier |
| --- | ----------- | --------- | ------------------------------ | -------- | ---- |
| 1   | `leader`    | Leader    | Orchestrator / final authority | Meta     | core |
| 2   | `atlas`     | Atlas     | Chief Architect                | Meta     | core |
| 3   | `forge`     | Forge     | Kernel Engineer                | Dev      | core |
| 4   | `pulse`     | Pulse     | Runtime Engineer               | Dev      | core |
| 5   | `mnemosyne` | Mnemosyne | Memory Engineer                | Research | core |
| 6   | `artisan`   | Artisan   | Tools & Skills Engineer        | Dev      | core |
| 7   | `prism`     | Prism     | Frontend / UX Engineer         | UX       | core |
| 8   | `sentinel`  | Sentinel  | QA & Safety Engineer           | Safety   | core |
| 9   | `bastion`   | Bastion   | DevOps Engineer                | Ops      | core |

(Lorekeeper is the **Persona & Docs Lead** — registered as a core Meta/Persona agent, id `lorekeeper`, not in the 9-build-team but part of the 50.)

### 4.2 Specialized Agents (41) — by domain

**Dev (9):** `forge`(cap), `pulse`(cap), `artisan`(cap), `compiler`, `debugger`, `reviewer`,
`tester`, `packager`, `perf-engineer`
**Research (5):** `mnemosyne`(cap), `muse`, `analyst`, `synthesizer`, `scholar`
**Ops (5):** `bastion`(cap), `deployer`, `monitor`, `incident`, `scaler`
**Safety (5):** `sentinel`(cap), `auditor`, `redteam`, `guardian`, `compliance`
**Comms (4):** `prism`(cap), `writer`, `translator`, `spokesperson`
**Finance (3):** `ledger`, `metering`, `billing`
**Legal (3):** `lex`, `policy`, `contract`
**Persona (3):** `lorekeeper`(cap), `biographer`, `taxonomist`
**Meta (2):** `atlas`(cap), `scheduler`
**UX (2):** `prism`(cap), `interaction`

(Counts are illustrative of the 41-slot plan; exact ids finalized as phases land.)

---

### 4.3 AUTHORITATIVE — The 20-Agent Fleet Roster (current operating reality)

> The 50-agent _build-team_ model (§4.1/§4.2) is the **design-time** plan. The system that actually
> runs is the **20-agent all-rounder fleet** defined in `AGENTS.md` and
> `docs/TEAM_OWNERSHIP_GOVERNANCE.md`. This roster is the source of truth for _operations_. Per
> `AGENTS.md`, the fleet forms a **dynamic team under the kernel dispatcher**, so every card's
> `reportsTo` culminates at **`forge`** (the kernel/scheduler owner and the universal admission
> seam), with `forge` reporting to `leader`. `lorekeeper` is the Persona & Docs Lead (this registry's
> owner) and is part of the fleet, not a separate 50.

| #   | id           | name       | role                                             | namespace (owner)            | reportsTo             | ring |
| --- | ------------ | ---------- | ------------------------------------------------ | ---------------------------- | --------------------- | ---- |
| 1   | `forge`      | Forge      | Kernel, Scheduler & Runtime Loop                 | kernel/scheduler/runtime     | `leader`              | 0    |
| 2   | `atlas`      | Atlas      | Orchestration, DAG & Agent Runtime               | orchestration                | `forge`               | 1    |
| 3   | `mnemosyne`  | Mnemosyne  | Memory Core & Recall                             | memory/recall                | `forge`               | 1    |
| 4   | `lethe`      | Lethe      | Memory Lifecycle, Training & Maint.              | memory-lifecycle             | `mnemosyne` → `forge` | 1    |
| 5   | `cerebrum`   | Cerebrum   | LLM Gateway & Inference                          | llm-gateway                  | `forge`               | 1    |
| 6   | `sentinel`   | Sentinel   | Security Core, Crypto & Guardrails               | security                     | `forge`               | 1    |
| 7   | `aegis`      | Aegis      | Reliability, Resilience, Audit & Compliance      | audit/reliability            | `sentinel` → `forge`  | 1    |
| 8   | `pulse`      | Pulse      | Self-Optimization & Improvement                  | self-opt                     | `forge`               | 1    |
| 9   | `metron`     | Metron     | Performance, Observability & Health              | observability                | `forge`               | 1    |
| 10  | `artisan`    | Artisan    | DevEx, SDK, Skills, Marketplace & Plugins        | devex/sdk/marketplace        | `forge`               | 2    |
| 11  | `helix`      | Helix      | Enterprise, Org/Tenant & Federated Mesh          | enterprise                   | `forge`               | 2    |
| 12  | `prism`      | Prism      | Primary Dashboard UI & State                     | dashboard-ui                 | `forge`               | 2    |
| 13  | `halcyon`    | Halcyon    | OS Kernel Admin & Enterprise Admin Pages         | admin-ui                     | `prism` → `forge`     | 2    |
| 14  | `ferric`     | Ferric     | Rust Core, Config, Provider-Types & Providers    | crates-core/config/providers | `forge`               | 3    |
| 15  | `rusty`      | Rusty      | Rust Tools, Safety, Installer, Obs, Search & CLI | crates-tools/safety/cli      | `ferric` → `forge`    | 3    |
| 16  | `tess`       | Tess       | Tauri Desktop Shell                              | nexus-tauri                  | `forge`               | 3    |
| 17  | `aeon`       | Aeon       | Protocols, MCP & External Connectors             | mcp/connectors               | `forge`               | 1    |
| 18  | `lorekeeper` | Lorekeeper | Docs, ADRs, Plans & Personas                     | docs                         | `forge`               | 4    |
| 19  | `quill`      | Quill      | Quality, Testing & Merge Gate                    | tests/merge-gate             | `forge`               | 4    |
| 20  | `bastion`    | Bastion    | Build, CI/CD, Infra & Tooling Config             | build/ci/infra               | `forge`               | 4    |

> **Reporting chain semantics:** the `→ forge` notation means the agent's _operational_ escalation
> targets `forge` (kernel dispatcher) as the team anchor; multi-hop chains (e.g. `aegis → sentinel →
forge`) are collapsed to the anchor for the runtime loop, while the intermediate owner is the
> _code-review_ line. `leader` is the human/Leader final authority above `forge`.

> **Captain mapping (§3) reconciliation:** in the 50-agent design, `forge`/`pulse`/`mnemosyne`/
> `artisan`/`prism`/`sentinel`/`bastion`/`atlas` are _captains_ of Dev/Research/UX/Safety/Ops/Meta
> domains. In the 20-agent fleet, those captains ARE the domain owners (1:1), so the captain map
> from §3 remains valid as the _design-time_ seed; the fleet roster above is the _runtime_ truth.

## 5. Naming Conventions

- **id:** kebab-case, lowercase, ≤ 20 chars. Domain prefix optional (`dev-reviewer`).
- **name:** PascalCase display name.
- **role:** imperative noun phrase ("Kernel Engineer", not "does kernel stuff").
- **model key:** one of `reasoning` (MiniMax-M3), `code` (MiniMax-M2.7),
  `routine` (MiniMax-M2.5-highspeed), or agent-specific override.
- **status:** every card starts `draft`; promoted to `active` when its phase module ships with tests.

---

## 6. JSON Schema (manifest validation)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://nexus.agentic-os/persona-card.schema.json",
  "title": "PersonaCard",
  "type": "object",
  "required": ["id", "name", "role", "domain", "tier", "capabilities", "status"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,19}$" },
    "name": { "type": "string", "minLength": 1 },
    "role": { "type": "string" },
    "domain": {
      "type": "string",
      "enum": [
        "dev",
        "research",
        "ops",
        "safety",
        "comms",
        "finance",
        "legal",
        "persona",
        "meta",
        "ux"
      ]
    },
    "tier": { "type": "string", "enum": ["core", "specialist"] },
    "captainOf": { "type": "string" },
    "model": { "type": "string" },
    "systemPromptRef": { "type": "string" },
    "capabilities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "domain", "category"],
        "properties": {
          "name": { "type": "string" },
          "domain": { "type": "string" },
          "category": {
            "type": "string",
            "enum": ["read", "write", "exec", "comms", "state", "admin"]
          },
          "sideEffects": { "type": "array", "items": { "type": "string" } },
          "scopes": { "type": "array", "items": { "type": "string" } },
          "failureMode": { "type": "string", "enum": ["fail-closed", "fail-open", "degrade"] }
        }
      }
    },
    "skills": { "type": "array", "items": { "type": "string" } },
    "permissions": { "type": "array", "items": { "type": "object" } },
    "maxConcurrency": { "type": "integer", "minimum": 1 },
    "ring": { "type": "integer", "minimum": 0, "maximum": 4 },
    "reportsTo": { "type": "string" },
    "status": { "type": "string", "enum": ["active", "draft", "deprecated"] }
  }
}
```

---

## 7. Lifecycle & Governance

- **Registry owner:** Lorekeeper. Renames require Leader sign-off (per team convention).
- **Deprecation:** follow `docs/DEPRECATION_POLICY.md` — 2-release notice before removal.
- **Capability changes:** any edit to a card's `capabilities` MUST keep `AgentCapability`
  (a2a-server) in sync; Sentinel reviews `exec`/`comms` side-effect cards.
- **Onboarding a new agent:** author card → validate against JSON Schema → register in
  Phase 13 specialization registry → activate when module ships with tests.

---

## 8. Open Questions

1. Should `Comms` and `UX` remain co-captained by `prism`, or split `ux` as a standalone captain?
2. Exact 41-specialist id list to be finalized as Phases 12–20 land (captains seed the splits).
3. Model override policy for specialist agents exceeding default tier budgets.

---

## 9. Persona Card Index (per-agent docs)

Each agent has a standalone card under [`docs/personas/`](../personas/). The 20-agent fleet cards
(§4.3) are authoritative for operations; the 30 specialist cards (§4.2) extend the design-time roster.

### 9.1 Fleet (20)

| # | id | Card |
| --- | --- | --- |
| 1 | `forge` | [docs/personas/forge.md](personas/forge.md) |
| 2 | `atlas` | [docs/personas/atlas.md](personas/atlas.md) |
| 3 | `mnemosyne` | [docs/personas/mnemosyne.md](personas/mnemosyne.md) |
| 4 | `lethe` | [docs/personas/lethe.md](personas/lethe.md) |
| 5 | `cerebrum` | [docs/personas/cerebrum.md](personas/cerebrum.md) |
| 6 | `sentinel` | [docs/personas/sentinel.md](personas/sentinel.md) |
| 7 | `aegis` | [docs/personas/aegis.md](personas/aegis.md) |
| 8 | `pulse` | [docs/personas/pulse.md](personas/pulse.md) |
| 9 | `metron` | [docs/personas/metron.md](personas/metron.md) |
| 10 | `artisan` | [docs/personas/artisan.md](personas/artisan.md) |
| 11 | `helix` | [docs/personas/helix.md](personas/helix.md) |
| 12 | `prism` | [docs/personas/prism.md](personas/prism.md) |
| 13 | `halcyon` | [docs/personas/halcyon.md](personas/halcyon.md) |
| 14 | `ferric` | [docs/personas/ferric.md](personas/ferric.md) |
| 15 | `rusty` | [docs/personas/rusty.md](personas/rusty.md) |
| 16 | `tess` | [docs/personas/tess.md](personas/tess.md) |
| 17 | `aeon` | [docs/personas/aeon.md](personas/aeon.md) |
| 18 | `lorekeeper` | [docs/personas/lorekeeper.md](personas/lorekeeper.md) |
| 19 | `quill` | [docs/personas/quill.md](personas/quill.md) |
| 20 | `bastion` | [docs/personas/bastion.md](personas/bastion.md) |

### 9.2 Specialists (30)

| id | Card | id | Card |
| --- | --- | --- | --- |
| `vulcan` | [vulcan.md](personas/vulcan.md) | `boreas` | [boreas.md](personas/boreas.md) |
| `orpheus` | [orpheus.md](personas/orpheus.md) | `calliope` | [calliope.md](personas/calliope.md) |
| `daedalus` | [daedalus.md](personas/daedalus.md) | `cleo` | [cleo.md](personas/cleo.md) |
| `hermes` | [hermes.md](personas/hermes.md) | `pan` | [pan.md](personas/pan.md) |
| `chronos` | [chronos.md](personas/chronos.md) | `eunomia` | [eunomia.md](personas/eunomia.md) |
| `nyx` | [nyx.md](personas/nyx.md) | `lachesis` | [lachesis.md](personas/lachesis.md) |
| `clio` | [clio.md](personas/clio.md) | `morpheus` | [morpheus.md](personas/morpheus.md) |
| `prometheus` | [prometheus.md](personas/prometheus.md) | `selene` | [selene.md](personas/selene.md) |
| `thoth` | [thoth.md](personas/thoth.md) | `helios` | [helios.md](personas/helios.md) |
| `janus` | [janus.md](personas/janus.md) | `terra` | [terra.md](personas/terra.md) |
| `hestia` | [hestia.md](personas/hestia.md) | `aether` | [aether.md](personas/aether.md) |
| `hephaestus` | [hephaestus.md](personas/hephaestus.md) | `eros` | [eros.md](personas/eros.md) |
| `athena` | [athena.md](personas/athena.md) | `nemesis` | [nemesis.md](personas/nemesis.md) |
| `gaia` | [gaia.md](personas/gaia.md) | `tyche` | [tyche.md](personas/tyche.md) |
| `persephone` | [persephone.md](personas/persephone.md) | `iris` | [iris.md](personas/iris.md) |

> 50 cards total (20 fleet + 30 specialists). Generated by Lore2 (teammate) under Lorekeeper's doc
> namespace — no code edits. See also `docs/api/openapi.yaml` and `docs/ARCHITECTURE.md`.

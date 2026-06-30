# NEXUS 2.0 — Build Synthesis Log

This file aggregates teammate reports as they arrive. Leader uses this to track cross-cutting decisions and open questions before synthesizing v1 architecture.

---

## ✅ Reports Received (7/9)

### 1. Atlas — MASTER_SPEC.md ✅ CRITICAL PATH UNLOCKED
- Status: **COMPLETED** — unblocks all downstream work.
- Need to read in full for cross-reconciliation.

### 2. Mnemosyne — MEMORY_ARCHITECTURE.md (136 lines) ✅
**Top DB pick:** Qdrant (semantic tier) — hybrid dense+sparse, MMR, re-ranking built-in; beats pgvector on feature richness for a multi-agent memory system.
**Open questions:**
1. Qdrant managed vs. self-hosted? → **Owner: Bastion** (resolved: monorepo + docker-compose suggests self-hosted by default; final answer in Bastion's plan)
2. Episodic: SQLite vs. append-only log? → **Owner: Pulse** (still pending)
3. Global scope schema blocked on Atlas's MASTER_SPEC §3 → **Owner: Atlas** (now in — needs cross-check)

### 3. Prism — CONTROL_PLANE_UX.md (319 lines) ✅
**Top 3 widgets:**
1. **Live Agent Map** — force-directed graph, 5-color status rings, click-to-detail
2. **Operator Console — Agent Control** — pause/resume/kill with HoldToConfirm
3. **Sidebar + Command Palette** — `Ctrl+K` fuzzy command palette, ≤3 interactions
**Open questions:**
1. Agent Map clustering — by team, task, or both? → **Owner: Atlas** §6
2. Persona Editor hot-reload safety — human-in-the-loop for Ring 0? → **Owners: Forge + Sentinel**
3. SSE trace fidelity — direct browser subscribe or backend `/api/v1/events`? → **Owner: Pulse**

### 4. Forge — KERNEL_DESIGN.md (288 lines) ✅
**Language pick:** Rust. (One-liner not provided, but Rust for kernel makes sense — memory safety, no-GC, async-friendly.)
**Open questions:** TBD — need full file read.

### 5. Sentinel — SAFETY_QA_STRATEGY.md (156 lines) ✅
**Eval harness:** `promptfoo` (primary) + `Braintrust` (post-deploy telemetry). *Declarative YAML, CI-native, first-class `redteam` mode — exact shape our pyramid needs, no lock-in.*
**Open questions:**
1. Tenancy boundary — single vs. per-agent isolated memory/tool scopes? Flips LLM02/LLM08 cost.
2. Model provider strategy — single vs. multi? Affects LLM03 supply-chain + LLM10 cost ceilings.
3. HITL placement — per-tool / per-task / per-incident? Drives `side_effect_consent` token + Prism UX.
4. (Bonus) Eval-corpus ownership — Sentinel owns safety; who owns domain golden traces (legal/finance)? → per-domain captains post-roster.

### 6. Bastion — OPS_CI_PLAN.md (768 lines) ✅
**CI runner:** `ubuntu-latest` (GitHub Actions). *Native GitHub integration, matrix builds, OIDC image signing, widest team familiarity.*
**Plan summary:** Monorepo (`apps/`, `infra/`, `ops/`) + `make up` one-command bring-up via Docker Compose (all 6 services + Prometheus + Grafana + Loki + Tempo + OTel Collector + Sentinel). 7-stage CI gate: `lint → unit → integration → sentinel-eval → build → deploy-staging → deploy-prod`. Cosign signing + Syft/Grype SBOM + SOPS/Vault secrets.
**Open questions:**
1. CI Runner OS — any services needing `macos-latest`/Windows? Ubuntu assumed.
2. Vault cluster — existing HashiCorp Vault, or provision new? Root token holder?
3. Deployment target — AWS EKS / GCP GKE / Azure AKS? Terraform modules differ. Needs Leader + Atlas sign-off.

### 7. Artisan — SKILL_REGISTRY.md (406 lines) ✅
**Top 5 seed skills:**
1. `file.read` — workspace file reads (foundation)
2. `bash.run` — shell exec with sandbox ⚙️ Sentinel review
3. `team.send_message` — inter-agent comms ⚙️ Sentinel review
4. `skill.invoke` — meta-skill (admin)
5. `memory.store` — persistent state
**Open questions:**
1. Skill manifest location — co-located with adapter, or centralized registry repo?
2. `InvocationContext` passing — thread-local, argument, or header? → **Owner: Pulse**
3. Skill versioning — strict (exact) or permissive (^semver)?

---

## 🔄 In Progress / Pending

- **Lorekeeper** — PERSONA_REGISTRY.md (idle_notification arrived, no report yet — likely still drafting)
- **Pulse** — RUNTIME_LOOP.md (idle_notification arrived, no report yet — likely still drafting)

---

## 🧭 Cross-Cutting Decisions Needed (after Pulse + Lorekeeper in)

1. **Language stack** — Atlas proposed; Forge said Rust (kernel); reconcile with Pulse's runtime language
2. **Message bus** — Forge proposed; Pulse's loop needs to consume it
3. **Vector DB** — Mnemosyne → Qdrant (✅), Bastion → self-host in compose (✅), resolved
4. **Memory × Runtime interface** — Mnemosyne ↔ Pulse contracts must match (depends on Pulse)
5. **Skill surface × Loop** — Artisan's 15-20 seed skills ↔ Pulse's loop invocation points (depends on Pulse)
6. **50-agent roster** — Atlas's roster slots ↔ Lorekeeper's domain taxonomy (depends on Lorekeeper)
7. **Tenancy model** — Sentinel's Q1 → affects Mnemosyne's scope design + Prism's UX
8. **HITL placement** — Sentinel's Q3 + Prism's Q2 → unified consent UX
9. **Deployment target** — Bastion's Q3 → Leader + Atlas sign-off needed
10. **Skill versioning** — Artisan's Q3 → Forge + Sentinel review

---

## 📊 File Inventory (workspace root)

| File | Author | Lines | Status |
|---|---|---|---|
| `MASTER_SPEC.md` | Atlas | TBD | ✅ |
| `MEMORY_ARCHITECTURE.md` | Mnemosyne | 136 | ✅ |
| `CONTROL_PLANE_UX.md` | Prism | 319 | ✅ |
| `KERNEL_DESIGN.md` | Forge | 288 | ✅ |
| `SAFETY_QA_STRATEGY.md` | Sentinel | 156 | ✅ |
| `OPS_CI_PLAN.md` | Bastion | 768 | ✅ |
| `SKILL_REGISTRY.md` | Artisan | 406 | ✅ |
| `RUNTIME_LOOP.md` | Pulse | TBD | ⏳ pending |
| `PERSONA_REGISTRY.md` | Lorekeeper | TBD | ⏳ pending |
| `NEXUS_BUILD_LOG.md` | Leader | this file | 🔄 |

**Total delivered so far:** 2,073+ lines of design across 7 documents.

---

## 🔮 Next Steps

1. **Wait for Pulse + Lorekeeper** (both showed idle but no report — likely mid-draft).
2. **Read Atlas's MASTER_SPEC.md in full** — cross-check Mnemosyne's global scope schema (Q3).
3. **Synthesize v1 NEXUS architecture** — one document for user sign-off covering:
   - Reconciled language stack (per layer)
   - Reconciled interfaces (kernel↔runtime, runtime↔memory, runtime↔skills)
   - 50-agent roster (Atlas's slots + Lorekeeper's taxonomy merged)
   - Open decisions list (for user approval)
4. **Wave 1 spawn** — the next ~10 specialized agents from Lorekeeper's taxonomy, after sign-off.
5. **PPIE-X Cycle #1 launch** — kick off perpetual improvement loop using the mapping above (Atlas audit, Forge robustness, etc.).
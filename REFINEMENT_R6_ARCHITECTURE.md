# REFINEMENT R6 – Architecture Alignment Review

**Summary Table**

| Severity | Issue | Phase/Section | Remediation |
|----------|-------|---------------|--------------|
| Critical | Direct UI → Gateway calls without ACP mediation | Multiple sections (P4‑P6) | Ensure all UI components route through ACP layer. Update diagrams and code stubs to remove any direct `gateway` imports from UI modules.
| High | Missing Phase 0 (Infrastructure) referenced by Phase 8 | Phase 8 (Routing) | Insert Phase 0 definition at start of P1 describing DB, Redis, Secrets Vault, and base config.
| High | Inconsistent ACP server naming (`ACP Server` vs `ACP` variable) across docs | Throughout P1‑P6 | Standardize to `ACP Server` and expose a single `acp` endpoint.
| Medium | Some Provider adapters listed under `gateway/` crate bypass ACP initial validation | Provider section in P2‑P3 | Add explicit ACP validation step before invoking provider adapters.
| Low | Diagram arrows missing for `Session Manager` → `ACP` in some phases | UI diagrams | Add missing edge to clarify session flow.

## Findings

### 1. Layer Connectivity
- The 5‑layer stack (UI → ACP → Orchestration → Gateway → Infrastructure) is **clearly defined** in the Architecture Analysis and repeated in P1‑P6 diagrams.
- However, a few textual references in Phase 4‑5 still describe UI components calling `gateway.complete()` directly. This violates the intended boundary and would bypass session management and request validation.
- **Remediation:** Replace direct gateway calls with `acp.sendMessage()` or `acp.invokeGateway()` wrappers; update the pseudo‑code snippets.

### 2. Phase 0 Missing
- Several cross‑phase dependency entries (e.g., in REFINEMENT_R9) reference a *Phase 0* for database and Redis setup, but the Master Plan starts at Phase 1.
- **Remediation:** Add a **Phase 0 – Infrastructure Foundations** section before Phase 1, listing:
  - Database schema init (SQLite + optional Postgres)
  - Redis cluster configuration
  - Secrets Vault creation
  - Base config file generation

### 3. ACP Consistency
- The term **ACP** is used both as a protocol name and as a Rust crate (`acp/`). In some places the documentation calls it “ACP Server”, elsewhere just “ACP”.
- All code references in the plan (e.g., `ACP --> ORCH_Layer`) use the same identifier, but the file layout mixes `acp/` and `acp_server/` directories.
- **Remediation:** Consolidate under a single `acp/` crate with a public `run_acp_server()` entry point. Update all docs to use `ACP Server` when describing the component and `acp` when referring to the module.

### 4. Interface Layering
- Provider adapters (`gateway/src/provider/...`) are shown as part of the Gateway layer, which is correct. However, a few UI design notes in P4 mention “direct provider selection UI”. Those UI elements must still interact via ACP, not call provider adapters directly.
- **Remediation:** Introduce a UI‑to‑ACP service API (`ui_acp_bridge`) that forwards provider selection to the ACP server, which then resolves the provider through the registry.

### 5. Architectural Drift
- The Architecture Analysis stresses **single‑binary distribution** and **ACP as the unification protocol**. The Master Plan’s later phases (P5‑P6) introduce a separate “MCP Registry” that appears to expose its own protocol.
- While MCP is a complementary protocol, the docs should clarify that MCP endpoints are always accessed **through ACP** (i.e., ACP forwards MCP calls). Current wording can be misinterpreted.
- **Remediation:** Add a note in the MCP section (Phase 22) stating “MCP services are reachable only via the ACP Server”.

## Conclusion
The overall architecture aligns with the 5‑layer vision, but the three critical gaps above must be fixed before implementation proceeds. Addressing them will eliminate layer‑boundary violations, complete the phase ordering, and ensure ACP remains the sole internal communication protocol.

*Report generated on 2026‑07‑03.*
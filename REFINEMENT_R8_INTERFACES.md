# REFINEMENT R8 – Interface Contracts Review

**Summary Table

| Severity | Issue | Interface | Remediation |
|----------|-------|-----------|--------------|
| Critical | ProviderAdapter defined three ways (trait, six‑trait split, struct) → ambiguous contract | ProviderAdapter | Consolidate to the **single unified trait** from Architecture Analysis (see §4.1). Remove duplicated `AIProvider/ChatProvider/etc.` traits. Update all implementation stubs to `impl ProviderAdapter for <Concrete>`.
| Critical | Router trait missing `metadata` method required for cost‑estimation | Router | Add `fn metadata(&self) -> RouteMeta` to the Router trait; update V6‑V7 implementations.
| High | Orchestrator API uses `run_dag(Vec<Node>)` but architecture expects `run_workflow(Workflow)` | Orchestrator | Define a `Workflow` enum (DAG, Pipeline, Graph) in `orchestrator.rs` and adjust signatures.
| High | Skill interface lacks `validate(&self, request: &SkillRequest) -> Result<()>` required for sandbox safety | Skill | Add `validate` method; implement default checks (size, prohibited syscalls).
| Medium | ACP protocol definition (`acp.sendMessage`) differs from Architecture Analysis (`acp.invoke`) | ACP | Align method name to `invoke`; add alias for backward compatibility.
| Medium | ProviderRegistry missing `list_capabilities(&self) -> Vec<Capability>` required for UI skill discovery | ProviderRegistry | Add method and update UI discovery flow.
| Low | TypeScript `gateway` module exports `Provider` constant instead of class | TS Gateway | Rename export to `ProviderAdapter` class; update imports.
| Low | `session` module returns raw JSON instead of typed `SessionInfo` struct expected by ACP | Session | Wrap JSON in `SessionInfo` type.

## Detailed Review

### ProviderAdapter
- Architecture Analysis (Section 4.1) defines a **single async trait** with methods `id()`, `capabilities()`, `models()`, `chat()`, `chat_stream()`, `health()`, `cost_estimate()`.
- P1‑P5 split this into six separate traits (`AIProvider`, `ChatProvider`, …) and also provide a concrete `struct ProviderAdapter` with fields `config`, `client`, `rate_limiter`.
- This creates **trait‑vs‑struct confusion** and makes composition with the Router impossible.
- **Remediation:** Remove the six separate traits, keep the unified trait, and refactor all concrete adapters (OpenAI, Anthropic, Gemini, etc.) to implement this trait.

### Router Interface (Phases 6‑7)
- Current Router trait (see `crates/routing/src/router.rs`) defines `fn route(&self, request: &ChatRequest) -> Result<ProviderId>`.
- Architecture expects routers to also provide **cost metadata** for budgeting (see ADR‑006).
- **Remediation:** Extend the trait with `fn metadata(&self, request: &ChatRequest) -> RouteMeta` where `RouteMeta` includes estimated cost, latency, and provider confidence.

### Orchestrator Interface (Phases 8‑9)
- P2 defines `fn run_dag(nodes: Vec<Node>)`.
- Architecture defines a **generic `run_workflow(workflow: Workflow)`** that can handle DAG, Pipeline, Graph.
- **Remediation:** Introduce a `Workflow` enum and refactor orchestrator implementations accordingly.

### Skill Interface (Phase 10)
- P1 defines `trait Skill { fn name(&self) -> String; fn execute(&self, input: SkillInput) -> SkillResult; }`.
- Architecture mandates a **validation step** for sandbox safety (see ADR‑005).
- **Remediation:** Add `fn validate(&self, request: &SkillRequest) -> Result<()>` with default checks (size, prohibited syscalls). Implement in all skill crates.

### ACP API (Layer L4)
- Documentation alternates between `acp.sendMessage` and `acp.invoke`.
- Standardise on **`acp.invoke(request)`** as the public entry point; keep `sendMessage` as a private alias for backwards compatibility.

### Provider Registry (Gateway Layer)
- UI discovery expects a `list_capabilities` method to populate the skill/provider selector UI.
- Add this method to the registry trait and expose via ACP `list_capabilities` endpoint.

### TypeScript Gateway Module
- `gateway/index.ts` currently exports a constant `Provider`.
- Refactor to export a **class `ProviderAdapter`** matching the Rust trait signature (async methods `chat`, `stream`, `health`). Update all imports in the TS side.

### Session Module
- The session module returns raw JSON blobs.
- Wrap the JSON in a strongly‑typed `SessionInfo` struct (defined in `crates/session/src/types.rs`) and expose through ACP `session.get` endpoint.

## Conclusion
The interface contracts need harmonisation around the **single ProviderAdapter trait**, extended router metadata, a generic workflow orchestrator, and added validation for skills. Aligning these contracts will enable seamless composition across layers and prevent runtime mismatches.

*Report generated on 2026‑07‑03.*
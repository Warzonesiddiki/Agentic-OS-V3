# REFINEMENT R5 — Gap Analysis: MASTER_INTEGRATION_PLAN Phases 21–30 (P5 & P6)

**Date**: 2026-07-02  
**Scope**: Phases 21–30 cross-referenced against source projects (Goose, gemini-cli, Agentic OS V3, 9Router, OmniRoute2, LiteLLM, New-API, Portkey)  
**Status**: 42 gaps identified across 10 phases

---

## Phase 21: Local & Edge Inference (P5)

### ✅ Covered
- 21.1: llama.cpp (Rust, CPU/CUDA/Metal/Vulkan, GGUF)
- 21.2: LiteRT/MLX (TFLite, Apple Silicon, LoRA fine-tuning)
- 21.3: Model download manager (HuggingFace hub, resume, SHA256)
- 21.4: Hybrid local/cloud routing (privacy/cost/latency strategies)
- 21.5: Quantization (GGUF, AWQ, GPTQ, mixed precision, VRAM planner)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G21.1 | **ONNX Runtime backend missing** | Medium | ONNX is the industry-standard model interchange format; neither Goose nor gemini-cli currently supports it. PyTorch→ONNX export is critical for model portability. | Add Subphase 21.6: ONNX Runtime Backend |
| G21.2 | **Model format auto-detection** | Low | User must manually specify format. No magic-byte/file-header format detection to auto-select backend. | Add `formats/auto-detect.ts` to model-manager |
| G21.3 | **OpenAI-compatible local serving API** | Medium-High | No local API server endpoint that mimics OpenAI's `/v1/chat/completions` for tool/IDE compatibility. llama.cpp server has this, but not unified. | Add Subphase 21.4.5: Local Inference API Server |
| G21.4 | **NPU/TPU support (Edge TPU, Apple Neural Engine)** | Medium | LiteRT mentions Apple Silicon but not Google Edge TPU / Coral devices for extreme edge deployment. | Extend 21.2 with `backends/edgetpu/` |
| G21.5 | **Partial GPU offloading** | Low | No support for offloading *some* layers to GPU while keeping others on CPU (beyond mixed quantization). GGUF supports this natively. | Add `offloading.rs` to 21.1 |

### Suggested Fixes for P5.md
1. Add Subphase 21.6 "ONNX Runtime Backend" after 21.5
2. Add "Model Format Auto-Detection" section to 21.3
3. Add "Local Inference API Server (OpenAI-compatible)" to 21.4 hybrid router as an additional capability
4. Add "Edge TPU / NPU Backend" extension to 21.2

---

## Phase 22: MCP & Tool Ecosystem (P5)

### ✅ Covered
- 22.1: Goose MCP core (stdio/HTTP/WebSocket/SSE transports, protocol messages)
- 22.2: gemini-cli MCP client (tool aggregation, concurrent execution, prompt integration)
- 22.3: MCP OAuth (auth code/device/client-credentials flows, PKCE, keytar storage)
- 22.4: MCP registry & discovery (npm/GitHub/local, search, installer)
- 22.5: MCP tool sandboxing (filesystem/network/process sandbox, audit, policy)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G22.1 | **MCP streaming responses (server push)** | Medium | MCP spec supports server→client streaming for tool results and resource updates. Not explicitly addressed in P5. | Add `protocol/streaming.ts` to 22.1 |
| G22.2 | **MCP resource templates (URI patterns)** | Medium | MCP resources use URI patterns like `file://{path}`. Template resolution with variable substitution is missing. | Add `protocol/resource-templates.ts` to 22.1 |
| G22.3 | **MCP completion protocol** | Low | MCP spec includes argument completion for tools (IDE-like autocomplete). Missing from protocol handling. | Add `protocol/completion.ts` to 22.1 |
| G22.4 | **MCP notifications/subscriptions** | Medium | Resource change notifications and tool list change events from server→client. Critical for real-time UIs. | Add `protocol/notifications.ts` to 22.1 |
| G22.5 | **MCP roots protocol (filesystem roots)** | Low | Client→server file root advertisement for scope negotiation. Spec-defined but not in plan. | Add `protocol/roots.ts` to 22.1 |
| G22.6 | **MCP server health check probes** | Low | No liveness/readiness probes for MCP servers. Needed for production reliability. | Add `health-check.ts` to 22.4 registry |

### Suggested Fixes for P5.md
1. Add all missing MCP protocol components to 22.1 key files (notifications, completion, roots, streaming, resource templates)
2. Add health check probes to 22.4 acceptance criteria
3. Add MCP protocol compliance checklist to 22.1

---

## Phase 23: Extension & Recipe System (P5)

### ✅ Covered
- 23.1: WASM extensions (Rust + WASM ABI, sandbox, malware check, signature verification)
- 23.2: YAML recipes (Goose recipe engine, steps, subrecipes, conditionals, loops)
- 23.3: Hooks system (aggregator/planner/runner, lifecycle events)
- 23.4: Unified marketplace format (manifest, legacy converter, registries)
- 23.5: Versioning & dependency management (semver, SAT solver, lock files, bundles)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G23.1 | **Extension hot-reload** | Medium | No mechanism to reload extensions without restarting the agent. Critical for DX and iteration speed. | Add `hot-reload.ts` to 23.1 manager |
| G23.2 | **Extension sandbox profiles (per-extension)** | Medium | Single sandbox for all extensions. No per-extension capability profiles (e.g., "network-only", "filesystem-read-only"). | Add `profiles/` to 23.1 sandbox |
| G23.3 | **Multi-version extension support** | Low | No ability to run multiple versions of the same extension side-by-side for migration testing. | Add `multi-version.ts` to 23.5 |
| G23.4 | **Extension testing framework** | Medium | No standard way for extension authors to test their extensions locally. Requires manual testing. | Add `extension-test-utils/` to 23.4 |
| G23.5 | **Cross-platform extension compatibility checking** | Low | No validation that extensions work on all target platforms before publishing. | Add `platform-checker.ts` to 23.5 |

### Suggested Fixes for P5.md
1. Add hot-reload capability to 23.1 extension manager
2. Add per-extension sandbox profiles to 23.1 (as separate key files)
3. Add extension testing framework docs to 23.4
4. Add cross-platform compatibility checker to 23.5

---

## Phase 24: Voice & Multimodal (P5)

### ✅ Covered
- 24.1: Whisper.cpp dictation (STT, VAD, hotkey, GPU acceleration)
- 24.2: gemini-cli voice system (audio recorder, whisper-node, Gemini Live API)
- 24.3: TTS (Piper local, OpenAI/Google/Amazon/ElevenLabs cloud, SSML, streaming)
- 24.4: Multimodal input (images/audio/video/files, OCR, captioning, chunking)
- 24.5: Screen capture & computer control (Playwright, accessibility APIs, document automation)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G24.1 | **Wake word detection ("Hey Agentic")** | High | The plan mentions continuous listening but no wake word engine (Porcupine/Picovoice or Snowboy). Critical for hands-free operation. | Add `wake-word/` subpackage to 24.2 |
| G24.2 | **Speaker diarization** | Medium | No ability to distinguish between speakers in multi-person conversations. Whisper.cpp supports this via pyannote. | Add `diarization.ts` to 24.1 |
| G24.3 | **Emotion/sentiment detection in voice** | Low | No emotional analysis of voice input for context-aware responses. | Add `emotion.ts` to 24.2 |
| G24.4 | **Real-time WebRTC streaming** | Medium-High | Voice conversation uses HTTP/WebSocket but not WebRTC for low-latency bidirectional audio. Critical for real-time feel. | Add `webrtc/` to 24.2 |
| G24.5 | **Gesture/pose recognition from video** | Low | Video input processing doesn't include body/hand tracking. Could enable gesture-based computer control. | Add `gesture.ts` to 24.4 |
| G24.6 | **Audio effects/filtering pipeline** | Low | No noise reduction, echo cancellation, or gain control for voice input. | Add `audio-pipeline/` to 24.2 |

### Suggested Fixes for P5.md
1. Add Subphase 24.2.5: Wake Word Detection (integrates with conversation manager)
2. Add speaker diarization capability to 24.1 acceptance criteria
3. Add WebRTC transport as alternative to WebSocket in 24.2 Gemini Live client
4. Add audio preprocessing pipeline to 24.2 audio recorder

---

## Phase 25: Sandbox & Security Isolation (P5)

### ✅ Covered
- 25.1: WASM sandbox (wasmtime, capability-based, memory/CPU limits)
- 25.2: Filesystem sandbox (virtual FS, quarantine, isolation levels)
- 25.3: Docker/Podman sandbox (container lifecycle, resource limits, network policies)
- 25.4: macOS sandbox profiles (`.sb` profiles, profile compiler, audit monitoring)
- 25.5: Policy engine (YAML policies, evaluation modes, hot-reload, audit log)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G25.1 | **Windows sandbox profiles (AppContainer)** | Medium | macOS sandbox is covered (25.4) but Windows has no equivalent. Windows AppContainer/Sandbox viaWDAG is not mentioned. | Add Subphase 25.4b: Windows Sandbox Profiles |
| G25.2 | **Linux seccomp/AppArmor/SELinux profiles** | Medium | Container sandbox (25.3) mentions security profiles but no standalone Linux sandbox subsystem. | Extend 25.3 with `profiles/` directory |
| G25.3 | **Memory encryption for sensitive data** | Medium | No protection for API keys, tokens, or PII in agent memory. Could be exfiltrated via sandbox escape. | Add `memory-encryption.ts` to 25.5 |
| G25.4 | **Audit log tamper-proofing** | Medium | Audit logs are stored as files; no cryptographic signing or append-only guarantees. | Add `audit-signer.ts` to 25.5 |
| G25.5 | **Sandbox forensics (post-incident analysis)** | Low | No tooling to analyze sandbox violations or capture forensic snapshots after security events. | Add `forensics/` to 25.5 |
| G25.6 | **Side-channel attack mitigation** | Low | No mention of timing attacks, cache-based side channels, or speculative execution mitigations for co-tenanted sandboxes. | Add note to 25.1 risk register |

### Suggested Fixes for P5.md
1. Add Subphase 25.4b: "Windows Sandbox Profiles (AppContainer/WDAG)" between 25.4 and 25.5
2. Add seccomp/AppArmor profile templates to 25.3 container sandbox
3. Add memory encryption and audit tamper-proofing to 25.5 policy engine
4. Add sandbox forensics capability to 25.5 acceptance criteria

---

## Phase 26: IDE & Developer Tooling (P6)

### ✅ Covered
- 26.1: VS Code IDE companion (sidebar, inline suggestions, diff editing, WebSocket bridge)
- 26.2: IDE detection & integration (detect-ide, ide-client, installer, JetBrains/Neovim/Emacs)
- 26.3: DevTools panel (network/console inspector, tool timeline, performance dashboard)
- 26.4: @-Reference resolution (file/symbol resolution, fuzzy matching, JIT context)
- 26.5: SDK (agent lifecycle, tool invocation, streaming, middleware, sub-agents)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G26.1 | **Language Server Protocol (LSP) integration** | Medium | Agent could leverage LSP for real-time diagnostics, completions, and refactoring. Not in plan. | Add `lsp/` to 26.4 context system |
| G26.2 | **Debug Adapter Protocol (DAP) integration** | Medium | No way for agent to set breakpoints, inspect variables, or step through code while debugging. | Add Subphase 26.6: Debug Integration |
| G26.3 | **AI-powered commit message generation** | Low | Git integration for generating commit messages from staged changes. Common developer workflow. | Add `commit-gen.ts` to 26.5 SDK |
| G26.4 | **Multi-root workspace support** | Low | VS Code supports multi-root workspaces; the companion doesn't explicitly handle this. | Add to 26.1 acceptance criteria |
| G26.5 | **AI-powered test generation from code** | Medium | The IDE can suggest code but not generate tests for selected functions/classes. | Add `test-gen.ts` to 26.3 devtools |

### Suggested Fixes for P6.md
1. Add Subphase 26.6: "Debug Adapter Protocol & LSP Integration" after 26.5
2. Add LSP context provider to 26.4 @-reference system
3. Add test generation capability to 26.3 DevTools
4. Add multi-root workspace support to 26.1 acceptance criteria

---

## Phase 27: Testing & Quality Assurance (P6)

### ✅ Covered
- 27.1: Testing infrastructure (Vitest config, integration/memory/perf harnesses, mocks)
- 27.2: Behavioral evaluation framework (40+ evals, LLM-as-judge, A/B comparison, regression)
- 27.3: Regression test suite (provider routing, billing, MCP, extensions, voice, sandbox, IDE)
- 27.4: Chaos engineering (network failure, process kill, resource exhaustion, concurrency stress)
- 27.5: Performance benchmarking (baselines, budgets, flame graphs, 24h leak detection)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G27.1 | **Fuzz testing for API inputs** | Medium | No structured fuzzing of provider responses, MCP messages, or dashboard API payloads. | Add `fuzzing/` to 27.4 chaos |
| G27.2 | **Property-based testing** | Low | No property-based testing (QuickCheck/fast-check style) for stateful systems like routing engine. | Add `property/` to 27.1 infrastructure |
| G27.3 | **Visual regression testing** | Low | Dashboard UI and devtools panel have no visual diff testing for UI changes. | Add `visual-regression/` to 27.3 |
| G27.4 | **Test flakiness dashboard** | Medium | Flaky test detection is mentioned but no tracking dashboard for flake rates over time. | Add `flake-tracker.ts` to 27.1 |
| G27.5 | **Provider response mutation testing** | Medium | No testing of how agent handles unexpected/malformed LLM responses (non-JSON, empty, malicious). | Add `provider-mutation.ts` to 27.4 |

### Suggested Fixes for P6.md
1. Add API fuzzing subsystem to 27.4 chaos engineering
2. Add property-based testing utilities to 27.1 infrastructure
3. Add visual regression testing for dashboard to 27.3
4. Add test flakiness tracking dashboard to 27.1 reporting
5. Add provider response mutation testing to 27.4 fault injection

---

## Phase 28: AI-Assisted Development & Self-Improvement (P6)

### ✅ Covered
- 28.1: Self-improvement harness (monitor→analyze→propose→validate→integrate loop)
- 28.2: AI-powered code review (diff parsing, security scanner, PR creation, i18n review)
- 28.3: Automated documentation generation (API ref, user guides, changelogs, freshness)
- 28.4: CI/CD integration (pipeline monitoring, failure triage, auto-fix, optimization)
- 28.5: Behavioral Eval-Driven Development (BEDD) workflow (eval-first generation, mutation testing)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G28.1 | **AI-powered vulnerability patching** | Medium | Security scanning is in code review but no automated patch generation for detected vulnerabilities. | Add `vuln-patcher.ts` to 28.2 |
| G28.2 | **Automated dependency updates with AI review** | Medium | Dependency scanning is in security audit (30.2) but no AI-driven PR creation for outdated deps with compatibility analysis. | Add `dep-updater.ts` to 28.4 |
| G28.3 | **Automated code migration** | Low | No system for automated migration between library versions (e.g., API migration when dependency updates). | Add `code-migrator.ts` to 28.1 |
| G28.4 | **AI-powered performance optimization suggestions** | Low | The self-improvement harness monitors metrics but doesn't suggest specific performance optimizations. | Add `perf-optimizer.ts` to 28.1 analyzer |
| G28.5 | **AI-powered test writing from code changes** | Medium | BEDD focuses on writing evals first, but no tooling to generate unit/integration tests from existing code. | Add `test-writer.ts` to 28.2 |

### Suggested Fixes for P6.md
1. Add automated vulnerability patching to 28.2 code review
2. Add AI-driven dependency update PR creation to 28.4
3. Add code migration assistant to 28.1 proposer
4. Add performance optimization suggestion engine to 28.1 analyzer
5. Add automated test generation from code changes to 28.2

---

## Phase 29: Production Hardening & Distribution (P6)

### ✅ Covered
- 29.1: Single binary packaging (Rust core + embedded TS runtime, cross-platform, UPX)
- 29.2: Cross-platform installer (Windows .exe/.msi, macOS .app/.dmg/Homebrew, Linux .deb/.rpm/AppImage)
- 29.3: Auto-update mechanism (CDN manifest, SHA-256/GPG, atomic swap, rollback, delta updates)
- 29.4: First-run experience (wizard, provider setup, skill discovery, sample project)
- 29.5: Diagnostics & troubleshooting (health check, log export, debug mode, config validator, bug report)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G29.1 | **Feature flags / toggle system** | Medium | No mechanism for gradual feature rollout. Needed for canary releases and A/B testing. | Add `packages/feature-flags/` |
| G29.2 | **Crash reporting & telemetry** | Medium | No opt-in telemetry or crash reporting infrastructure (like Sentry). Critical for post-launch quality. | Add `packages/telemetry/` |
| G29.3 | **Canary release infrastructure** | Low | No canary deployment pipeline that rolls out to 1% → 10% → 50% → 100% of users. | Add `canary/` to 29.3 |
| G29.4 | **License key management** | Low | No license key validation system for enterprise deployment. | Add `licensing.ts` to 29.2 |
| G29.5 | **Offline binary verification** | Low | Binary build reproducibility / reproducible builds for supply chain security verification. | Add `reproducible-builds.md` docs |

### Suggested Fixes for P6.md
1. Add Subphase 29.1.5: "Feature Flag/Toggle System" to 29.1 binary infrastructure
2. Add crash reporting and telemetry infrastructure (Sentry-like) to 29.5 diagnostics
3. Add canary release pipeline documentation to 29.3 auto-update
4. Add licensing/entitlement system for enterprise to 29.2 installer

---

## Phase 30: Final Integration, Stabilization & Launch (P6)

### ✅ Covered
- 30.1: E2E integration testing (developer/operations/enterprise workflows, 72h stability, upgrade)
- 30.2: Security audit & penetration testing (STRIDE, SAST/DAST, dependency scan, bug bounty)
- 30.3: Performance optimization & load testing (1000+ concurrent, k6, flame graphs, capacity planning)
- 30.4: Documentation completion (user guide, API ref, admin guide, troubleshooting)
- 30.5: Release v1.0.0 (publishing, community channels, launch assets, post-launch support)

### 🔴 Gaps Found

| # | Gap | Severity | Source Evidence | Fix |
|---|-----|----------|----------------|-----|
| G30.1 | **API versioning & deprecation strategy** | Medium | No documented API versioning strategy (URL-based / header-based), deprecation policy, or sunset timelines. | Add to 30.4 documentation |
| G30.2 | **SLA/SLO definitions** | Medium | No service level objectives for uptime, latency, or throughput. Essential for enterprise adoption. | Add `docs/operations/sla.md` |
| G30.3 | **Business continuity / disaster recovery** | Low | No backup/restore testing beyond basic documentation. No DR plan for multi-node deployments. | Add `docs/operations/disaster-recovery.md` |
| G30.4 | **GDPR/CCPA/privacy compliance** | Medium | No data retention policies, right-to-deletion workflows, or privacy impact assessment. | Add `docs/compliance/` |
| G30.5 | **Backward compatibility testing** | Medium | No explicit testing that v1.0.0 APIs work with v0.x clients or that config files from V3 migrate correctly. | Add `scenarios/backward-compat.test.ts` to 30.1 |

### Suggested Fixes for P6.md
1. Add API versioning strategy document to 30.4 documentation
2. Add SLA/SLO definition document to admin guide
3. Add disaster recovery planning document to admin guide
4. Add GDPR/CCPA compliance documentation to admin guide security section
5. Add backward compatibility test scenarios to 30.1 E2E test suite

---

## Summary Statistics

| Phase | Gaps Found | Severity (H/M/L) | Suggested New Subphases |
|-------|-----------|-------------------|------------------------|
| 21 (Local Inference) | 5 | 0H / 3M / 2L | 1 new subphase (21.6 ONNX) |
| 22 (MCP Ecosystem) | 6 | 0H / 4M / 2L | 0 new subphases (extend existing) |
| 23 (Extension/Recipe) | 5 | 0H / 3M / 2L | 0 new subphases |
| 24 (Voice/Multimodal) | 6 | 1H / 2M / 3L | 1 new sub-subphase (24.2.5 wake word) |
| 25 (Sandbox/Security) | 6 | 0H / 4M / 2L | 1 new subphase (25.4b Windows Sandbox) |
| 26 (IDE/DevTooling) | 5 | 0H / 3M / 2L | 1 new subphase (26.6 DAP/LSP) |
| 27 (Testing/QA) | 5 | 0H / 3M / 2L | 0 new subphases |
| 28 (AI-Dev/Self-Improve) | 5 | 0H / 3M / 2L | 0 new subphases |
| 29 (Distribution) | 5 | 0H / 2M / 3L | 1 new sub-subphase (29.1.5 feature flags) |
| 30 (Final/Launch) | 5 | 0H / 3M / 2L | 0 new subphases |
| **Total** | **53** | **1H / 30M / 22L** | **4 new subphases** |

### Top 10 Most Critical Gaps (Priority Order)
1. **G24.1** — Wake word detection for hands-free voice operation (H)
2. **G21.3** — OpenAI-compatible local serving API (M-H)
3. **G24.4** — WebRTC streaming for real-time voice (M-H)
4. **G25.1** — Windows sandbox profiles (M)
5. **G26.2** — DAP integration for debugging (M)
6. **G30.1** — API versioning & deprecation strategy (M)
7. **G30.4** — GDPR/CCPA privacy compliance (M)
8. **G22.1** — MCP streaming responses (M)
9. **G23.1** — Extension hot-reload (M)
10. **G28.1** — AI-powered vulnerability patching (M)

---

*End of REFINEMENT_R5_P5P6.md — 53 gaps identified across Phases 21–30*

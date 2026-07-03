# MASTER INTEGRATION PLAN — PART 5: Phases 21–25
## Agentic OS V4 — The Universal Agent Operating System

**Document Version**: 1.0
**Date**: 2026-07-02
**Author**: Agentic OS V4 Integration Team

---

## Overview

This document is **Part 5** of the 30-Phase Master Integration Plan for merging **8 projects** into **Agentic OS V4**:

1. **Goose** — llama.cpp local inference, Whisper dictation, MCP, extensions (WASM), recipes (YAML), computer control (Playwright/MCP), auto-update
2. **gemini-cli** — LiteRT/MLX local inference, MCP client/oauth, hooks system, voice (whisper, Gemini Live), sandbox (Docker, macOS, filesystem), policy engine, sandboxed shell
3. **Agentic OS V3** — WASM sandbox, agent orchestration, pipeline execution, P2P swarm
4. **9Router** — AI gateway with 100+ providers, protocol translation, SSE streaming, MITM proxy
5. **OmniRoute2** — Advanced routing, combo routing, cost optimization
6. **LiteLLM** — Provider proxy, caching, guardrails, rate limiting
7. **New-API** — Billing, user management, key management
8. **Portkey** — Middleware, observability, plugin system

**Part 5** covers **Phases 21–25**, which focus on the **infrastructure and platform layers**: local inference, MCP ecosystem, extension/recipe unification, voice/multimodal capabilities, and sandbox/security isolation. These phases are critical for making Agentic OS V4 a self-contained, private, secure, and extensible platform that can run entirely offline while still connecting to cloud services when desired.

---

## Phase 21: Local & Edge Inference
**Duration**: 6 weeks
**Dependencies**: Phase 6 (Local Inference foundation), Phase 20 (Provider Gateway completion)
**Overall Risk**: HIGH — Complex native bindings, model format fragmentation, GPU acceleration diversity

### Overview
Phase 21 integrates two distinct local inference engines into a unified local inference subsystem. **Goose's llama.cpp** provides CPU/GPU-accelerated inference with broad model support (GGUF format), while **gemini-cli's LiteRT/MLX** provides Apple Silicon-optimized inference via MLX and lightweight TensorFlow Lite runtime. This phase creates a model download manager, hybrid local/cloud routing, and quantized model management to give users seamless access to local AI regardless of hardware platform.

---

#### Subphase 21.1: Import Goose's Local Inference (llama.cpp bindings via Rust)
**Week**: 1
**Description**: Port Goose's llama.cpp integration from the Rust crate `goose-local-inference` into the unified monorepo. This subsystem provides CPU and GPU-accelerated inference for large language models using the GGUF format, with support for Metal (Apple Silicon), CUDA (NVIDIA), and Vulkan (cross-platform GPU) backends. The existing Rust bindings use the `llama-cpp-2` crate for direct C++ FFI access, exposing model loading, inference, tokenization, and embedding endpoints. This subphase adapts the Rust code into `packages/local-inference` with a TypeScript SDK layer for cross-language consumption by the desktop app, CLI, and dashboard. The llama.cpp backend will serve as the primary CPU/GPU inference engine for models >=1B parameters, with streaming token generation and tool-use emulation for models without native function calling.

**Copy Source**: `goose_repo/crates/goose-local-inference/` → `packages/local-inference/backends/llamacpp/`

**Key Files to Create/Modify**:
- `packages/local-inference/backends/llamacpp/Cargo.toml` — Rust crate config with llama-cpp-2 dependency
- `packages/local-inference/backends/llamacpp/src/lib.rs` — Main FFI bindings and init
- `packages/local-inference/backends/llamacpp/src/inference.rs` — Model loading, token generation, streaming
- `packages/local-inference/backends/llamacpp/src/embedding.rs` — Embedding extraction
- `packages/local-inference/backends/llamacpp/src/tool_emulation.rs` — Tool-use emulation for non-tool models
- `packages/local-inference/backends/llamacpp/src/context.rs` — Context window management
- `packages/local-inference/backends/llamacpp/src/backends/metal.rs` — Metal GPU backend
- `packages/local-inference/backends/llamacpp/src/backends/cuda.rs` — CUDA GPU backend
- `packages/local-inference/backends/llamacpp/src/backends/vulkan.rs` — Vulkan GPU backend
- `packages/local-inference/backends/llamacpp/src/backends/cpu.rs` — CPU-only fallback
- `packages/local-inference/backends/llamacpp/build.rs` — Build script for llama.cpp compilation
- `packages/local-inference/backends/llamacpp/vendor/llama.cpp/` — Git submodule or vendored llama.cpp
- `packages/local-inference/sdk/llamacpp-client.ts` — TypeScript client for llama.cpp backend
- `packages/local-inference/sdk/types.ts` — Shared type definitions
- `packages/local-inference/sdk/streaming.ts` — Streaming response handling
- `apps/cli/src/commands/local-inference.ts` — CLI commands for local inference
- `packages/gateway/src/providers/local/llamacpp-provider.ts` — Provider adapter for gateway routing

**Acceptance Criteria**:
- [ ] llama.cpp compiles on Linux (x86_64, aarch64), macOS (arm64, x86_64), Windows (x86_64)
- [ ] Metal backend loads and runs inference on Apple Silicon with <2s cold start
- [ ] CUDA backend loads and runs inference on NVIDIA GPUs
- [ ] CPU-only fallback works with no GPU available
- [ ] Streaming token generation produces tokens at >20 tok/s on modern hardware
- [ ] Tool-use emulation synthesizes function calls from plain-text model output
- [ ] Embedding extraction returns vectors of configurable dimensions
- [ ] Context window management handles >4096 tokens with sliding window
- [ ] TypeScript SDK correctly wraps all Rust exports via FFI/napi-rs
- [ ] CLI command `agentic local run --model <path>` starts interactive inference session

**Risk Level**: HIGH — Native compilation complexities across 3 OS × 4 backends = 12 build matrix combinations; llama.cpp compilation times can exceed 30 minutes; GPU driver versioning conflicts; Apple Silicon Metal API changes; napi-rs FFI boundaries require careful memory management

---

#### Subphase 21.2: Import gemini-cli's Local Inference (LiteRT/MLX via localLiteRtLmClient)
**Week**: 2
**Description**: Port gemini-cli's LiteRT and MLX-based local inference engine. The `localLiteRtLmClient` provides lightweight, on-device inference using TensorFlow Lite Runtime (LiteRT) for quantized models optimized for edge deployment, and MLX (Apple's machine learning framework for Apple Silicon) for high-performance inference on macOS. Unlike llama.cpp's broad model support, LiteRT focuses on small, optimized models (<7B parameters) with fast cold-start times, making it ideal for classification, summarization, and real-time tasks. The MLX backend provides native Apple Silicon performance for Apple's optimized models and community models exported to MLX format. This subphase creates a unified local inference abstraction layer that can route between llama.cpp, LiteRT, and MLX based on model format, hardware availability, and performance requirements.

**Copy Source**: `gemini-cli/packages/core/src/local/` → `packages/local-inference/backends/litert/` and `packages/local-inference/backends/mlx/`

**Key Files to Create/Modify**:
- `packages/local-inference/backends/litert/package.json` — LiteRT backend package config
- `packages/local-inference/backends/litert/src/index.ts` — LiteRT main entry and initialization
- `packages/local-inference/backends/litert/src/litert-client.ts` — LiteRT model client (from localLiteRtLmClient)
- `packages/local-inference/backends/litert/src/model-loader.ts` — LiteRT model loading (TFLite format)
- `packages/local-inference/backends/litert/src/inference.ts` — Inference execution with token streaming
- `packages/local-inference/backends/litert/src/embedding.ts` — Embedding generation
- `packages/local-inference/backends/litert/src/quantization.ts` — Post-training quantization tools
- `packages/local-inference/backends/mlx/package.json` — MLX backend package config
- `packages/local-inference/backends/mlx/src/index.ts` — MLX main entry and initialization
- `packages/local-inference/backends/mlx/src/mlx-client.ts` — MLX model client (Python bridge via PyO3/child_process)
- `packages/local-inference/backends/mlx/src/model-loader.ts` — MLX model loading (.safetensors, HF format)
- `packages/local-inference/backends/mlx/src/inference.ts` — MLX inference with Apple Silicon acceleration
- `packages/local-inference/backends/mlx/src/training.ts` — LoRA fine-tuning on-device (MLX unique capability)
- `packages/local-inference/backends/mlx/python/` — Python MLX bridge scripts
- `packages/local-inference/abstractions/model-router.ts` — Unified router across backends
- `packages/local-inference/abstractions/backend-interface.ts` — Backend interface contract
- `packages/local-inference/abstractions/capabilities.ts` — Backend capability detection
- `packages/local-inference/abstractions/hardware-detection.ts` — GPU/CPU/Neural Engine detection

**Acceptance Criteria**:
- [ ] LiteRT backend loads and runs TFLite models on macOS, Linux, Windows
- [ ] MLX backend loads and runs MLX models on Apple Silicon (M1-M4 series)
- [ ] LiteRT achieves <500ms cold start for models <3B parameters
- [ ] MLX achieves >30 tok/s on M2 Ultra for 7B parameter models
- [ ] Unified model router auto-selects backend based on model format
- [ ] Hardware detection correctly identifies available GPU accelerators
- [ ] LiteRT embedding generation works for text classification tasks
- [ ] MLX LoRA fine-tuning can adapt a 7B model in <30 minutes on M2 Ultra
- [ ] Backend fallback works: MLX → LiteRT → llama.cpp CPU → error
- [ ] TypeScript abstraction layer unifies streaming interface across all backends
- [ ] CLI command `agentic local backends` lists available backends with hardware info

**Risk Level**: HIGH — MLX requires Python bridge (PyO3 or subprocess), adding deployment complexity; LiteRT Node.js bindings may need rebuilding for each platform; MLX only available on macOS, requiring conditional dependency resolution; TFLite model format incompatibility between versions

---

#### Subphase 21.3: Implement Model Download Manager and Versioning
**Week**: 3
**Description**: Build a comprehensive model download manager that handles the complete lifecycle of local AI models. This subsystem provides model discovery (HuggingFace Hub, custom registries), download with resume support, integrity verification (SHA256 checksums), format conversion (GGUF ↔ SafeTensors ↔ TFLite ↔ MLX), version tracking, and automatic cleanup of unused models. The manager maintains a local model registry database (SQLite) tracking installed models, their formats, quantization levels, performance benchmarks, and usage statistics. A background daemon periodically checks for model updates and can pre-download popular models based on usage patterns. The system supports concurrent downloads with bandwidth limiting, and integrates with the unified backend router to ensure models are downloaded to the correct directory for their target backend.

**Copy Source**: `goose_repo/crates/goose-local-inference/src/model_registry/` + `gemini-cli/packages/core/src/local/model-manager.ts`

**Key Files to Create/Modify**:
- `packages/local-inference/model-manager/src/index.ts` — Main model manager entry
- `packages/local-inference/model-manager/src/downloader.ts` — HTTP download with resume, chunking, checksums
- `packages/local-inference/model-manager/src/registry.ts` — Model registry database operations
- `packages/local-inference/model-manager/src/discovery.ts` — HuggingFace Hub API integration
- `packages/local-inference/model-manager/src/versioning.ts` — Semantic versioning for models
- `packages/local-inference/model-manager/src/converter.ts` — Cross-format model conversion
- `packages/local-inference/model-manager/src/cleanup.ts` — Automatic unused model cleanup
- `packages/local-inference/model-manager/src/benchmark.ts` — Model performance benchmarking
- `packages/local-inference/model-manager/src/prefetch.ts` — Predictive model pre-download
- `packages/local-inference/model-manager/src/bandwidth.ts` — Bandwidth limiting and scheduling
- `packages/local-inference/model-manager/src/types.ts` — Model metadata, manifest types
- `packages/local-inference/model-manager/schema.sql` — SQLite schema for model registry
- `packages/local-inference/model-manager/default-models.json` — Curated list of recommended models
- `apps/cli/src/commands/model.ts` — CLI commands: `agentic model list/pull/remove/convert/benchmark`

**Acceptance Criteria**:
- [ ] Download with resume recovers from interrupted downloads at byte-level precision
- [ ] SHA256 checksum verification rejects corrupted downloads with clear error message
- [ ] HuggingFace Hub search finds models by name, task, format, and size
- [ ] Model registry persists across restarts in SQLite database
- [ ] Format conversion between GGUF ↔ SafeTensors works for common architectures (Llama, Mistral, Qwen)
- [ ] Automatic cleanup removes unused models after configurable TTL
- [ ] Benchmarking runs standardized tests (tok/s, memory usage, latency p50/p95/p99)
- [ ] Prefetch daemon downloads models during idle time based on usage prediction
- [ ] Bandwidth limiting throttles downloads to configurable max Mbps
- [ ] Concurrent downloads (up to 3 simultaneous) work without corruption
- [ ] CLI `model list` shows installed models with format, size, and benchmark results
- [ ] CLI `model pull --quantization q4_k_m` downloads specific quantization level

**Risk Level**: MEDIUM — HuggingFace Hub API rate limits and breaking changes; model conversion requires significant engineering for cross-format compatibility; storage management on user machines with limited disk space; legal/license considerations for model redistribution

---

#### Subphase 21.4: Implement Hybrid Local/Cloud Routing (Auto-Detect When to Use Local vs Cloud)
**Week**: 4–5
**Description**: Develop an intelligent routing layer that automatically decides whether to execute inference locally or via a cloud provider based on multiple factors: model availability, hardware capability, latency requirements, cost sensitivity, privacy requirements, and network status. The hybrid router continuously monitors local inference performance (tokens-per-second, memory usage, queue depth) and cloud provider latency/availability, maintaining a real-time routing table. Users can configure routing policies per-task: privacy-first (always local for sensitive data), performance-first (always cloud for complex tasks), cost-optimized (local for simple, cloud for hard), or latency-optimized (whichever is faster). The router supports transparent failover: if local inference is too slow or cloud is unreachable, it seamlessly switches to the alternative. For sensitive operations, the router enforces data residency policies, ensuring data never leaves the local machine when configured.

**Copy Source**: New subsystem (combining `goose_repo/crates/goose-local-inference/src/routing/` concepts + `gemini-cli/packages/core/src/local/routing.ts`)

**Key Files to Create/Modify**:
- `packages/local-inference/hybrid-router/src/index.ts` — Hybrid router main entry
- `packages/local-inference/hybrid-router/src/routing-engine.ts` — Core routing decision engine
- `packages/local-inference/hybrid-router/src/strategy.ts` — Routing strategy definitions (privacy, cost, latency, performance)
- `packages/local-inference/hybrid-router/src/monitor.ts` — Real-time performance monitoring (local + cloud)
- `packages/local-inference/hybrid-router/src/telemetry.ts` — Latency/cost tracking per model
- `packages/local-inference/hybrid-router/src/policy.ts` — Data residency and privacy policy enforcement
- `packages/local-inference/hybrid-router/src/failover.ts` — Transparent failover between backends
- `packages/local-inference/hybrid-router/src/cache.ts` — Response caching for repeated queries
- `packages/local-inference/hybrid-router/src/queue.ts` — Request queuing with priority levels
- `packages/local-inference/hybrid-router/src/types.ts` — Routing configuration types
- `packages/gateway/src/routing/hybrid-router.ts` — Gateway integration for hybrid routing
- `packages/config/src/schemas/hybrid-routing.ts` — Configuration schema for routing policies
- `apps/cli/src/commands/routing.ts` — CLI commands: `agentic routing status/policy/set`
- `packages/telemetry/src/hybrid-router-metrics.ts` — Telemetry integration

**Acceptance Criteria**:
- [ ] Router correctly selects local vs cloud based on configured strategy (privacy, cost, latency)
- [ ] Real-time performance monitoring updates routing decisions within 1 second
- [ ] Privacy policy prevents data from being sent to cloud when configured as local-only
- [ ] Transparent failover switches from local to cloud (or vice versa) mid-conversation without data loss
- [ ] Cost tracking records per-request cost in USD for cloud vs $0 for local
- [ ] Latency comparison consistently selects the faster option with <5% error rate
- [ ] Request queue handles concurrent requests with proper priority ordering
- [ ] Response cache returns cached results for identical queries within configurable TTL
- [ ] CLI `routing status` shows current strategy, active backend, and real-time metrics
- [ ] Configuration schema validates all routing policy combinations
- [ ] Telemetry emits metrics for routing decisions, latency, and cost savings
- [ ] Default "auto" strategy achieves >80% user satisfaction in blind A/B testing

**Risk Level**: HIGH — Real-time routing decisions are inherently complex with many inputs; performance monitoring overhead must be minimal (<1ms per decision); cost tracking requires up-to-date cloud provider pricing data; privacy policy enforcement must be provably correct (defense in depth); failover mid-stream requires careful state management

---

#### Subphase 21.5: Implement Quantized Model Management (GGUF, AWQ, GPTQ)
**Week**: 6
**Description**: Build a comprehensive quantization management subsystem that handles the download, validation, benchmarking, and serving of quantized models in three major formats: **GGUF** (llama.cpp's native format, supporting 2-bit to 8-bit quantization), **AWQ** (Activation-aware Weight Quantization for NVIDIA GPUs), and **GPTQ** (Post-Training Quantization for GPU inference). The subsystem provides a quantization profiler that analyzes model quality vs. size tradeoffs across quantization levels, an auto-quantizer that can convert any supported model to a target quantization, and a quantization-aware model loader that selects the optimal quantization level based on available VRAM/RAM. Users can specify `--quantization auto` to have the system automatically select the best quantization for their hardware, or specify exact levels like `q4_k_m`, `q8_0`, `awq-4bit`, or `gptq-4bit-32g`. The subsystem also handles mixed quantization, where different layers of the same model use different quantization levels for optimal quality/speed tradeoffs.

**Copy Source**: `goose_repo/crates/goose-local-inference/src/quantization/` + `gemini-cli/packages/core/src/local/quantization.ts`

**Key Files to Create/Modify**:
- `packages/local-inference/quantization/src/index.ts` — Quantization manager main entry
- `packages/local-inference/quantization/src/profiler.ts` — Quantization quality/size profiler
- `packages/local-inference/quantization/src/gguf.ts` — GGUF format handler (read/write/convert)
- `packages/local-inference/quantization/src/awq.ts` — AWQ format handler
- `packages/local-inference/quantization/src/gptq.ts` — GPTQ format handler
- `packages/local-inference/quantization/src/auto-quantizer.ts` — Automatic quantization selector
- `packages/local-inference/quantization/src/mixed-precision.ts` — Mixed quantization precision scheduling
- `packages/local-inference/quantization/src/vram-planner.ts` — VRAM-aware quantization planning
- `packages/local-inference/quantization/src/calibration.ts` — Calibration dataset management for AWQ/GPTQ
- `packages/local-inference/quantization/src/benchmark.ts` — Quantization-specific benchmarks
- `packages/local-inference/quantization/src/types.ts` — Quantization configuration types
- `packages/local-inference/quantization/src/converters/gguf-to-awq.ts` — Cross-format converter
- `packages/local-inference/quantization/src/converters/gguf-to-gptq.ts` — Cross-format converter
- `packages/local-inference/quantization/src/converters/awq-to-gguf.ts` — Cross-format converter
- `packages/local-inference/model-manager/src/formats.ts` — Format detection and validation
- `apps/cli/src/commands/quantize.ts` — CLI commands: `agentic quantize list/profile/convert`

**Acceptance Criteria**:
- [ ] GGUF models at q4_k_m, q5_k_m, q8_0, q2_k levels load and run correctly
- [ ] AWQ 4-bit models load and run on NVIDIA GPUs with CUDA acceleration
- [ ] GPTQ 4-bit-32g and 4-bit-128g models load and run on NVIDIA GPUs
- [ ] Auto-quantization selects appropriate level based on VRAM availability
- [ ] Quantization profiler shows quality metrics (perplexity) vs size for each level
- [ ] Mixed quantization applies higher precision to first/last layers, lower to middle layers
- [ ] VRAM planner accurately predicts memory usage for each quantization level
- [ ] Cross-format conversion (GGUF→AWQ, AWQ→GGUF) produces valid models
- [ ] Calibration dataset management supports common datasets (wikitext, c4, ptb)
- [ ] CLI `quantize list` shows available quantizations for installed models
- [ ] CLI `quantize profile <model>` generates quality/size tradeoff report
- [ ] All quantization operations include progress indicators for long-running tasks
- [ ] Quantization-aware model loading under `--quantization auto` works in <5 seconds

**Risk Level**: HIGH — Quantization format specifications are complex and sometimes undocumented; AWQ/GPTQ require calibration data and GPU compute for conversion; cross-format conversion can produce degraded models if not done carefully; quality evaluation requires running perplexity benchmarks which are time-consuming; quantization levels have different support across backends (GGUF works on CPU, AWQ/GPTQ require GPU)

---

## Phase 22: MCP & Tool Ecosystem
**Duration**: 5 weeks
**Dependencies**: Phase 3 (ACP Server), Phase 4 (Recipe & Skill Unification)
**Overall Risk**: MEDIUM — Protocol standardization reduces integration risk, but security boundaries and OAuth flow complexity require careful engineering

### Overview
Phase 22 unifies the Model Context Protocol (MCP) implementations from Goose and gemini-cli into a single, comprehensive MCP ecosystem. This includes importing Goose's full MCP server/client implementation, gemini-cli's MCP client with OAuth support, creating a unified MCP registry for tool/service discovery, and implementing security sandboxing around MCP tools to prevent malicious or buggy MCP servers from compromising the host system.

---

#### Subphase 22.1: Import Goose MCP Integration
**Week**: 1
**Description**: Port Goose's MCP integration from its Rust implementation (`crates/goose-mcp/`) into the unified monorepo. Goose's MCP integration includes a full MCP client supporting stdio, HTTP, and WebSocket transports; an MCP server runner that can spawn and manage external MCP server processes; tool call routing with confirmation dialogs; resource access via MCP resource URIs; and prompt template management from MCP servers. The integration follows the official MCP specification, supporting both client-initiated and server-initiated communication patterns. Importantly, Goose's MCP implementation includes built-in specialized MCP servers: computer controller (Playwright-based browser/desktop automation), auto-visualiser (chart/diagram generation), memory (knowledge graph persistence), and file operations. This subphase migrates the core MCP client/server framework to TypeScript with Rust-native FFI for performance-critical paths.

**Copy Source**: `goose_repo/crates/goose-mcp/` → `packages/mcp/core/`

**Key Files to Create/Modify**:
- `packages/mcp/core/src/index.ts` — Main MCP module entry
- `packages/mcp/core/src/client/mcp-client.ts` — Core MCP client (from client.rs)
- `packages/mcp/core/src/client/transports/stdio.ts` — Stdio transport for subprocess MCP servers
- `packages/mcp/core/src/client/transports/http.ts` — HTTP transport for remote MCP servers
- `packages/mcp/core/src/client/transports/websocket.ts` — WebSocket transport for persistent connections
- `packages/mcp/core/src/client/transports/sse.ts` — SSE transport for server-sent events
- `packages/mcp/core/src/server/mcp-server-runner.ts` — MCP server process lifecycle manager
- `packages/mcp/core/src/server/stdio-server.ts` — Stdio-based MCP server implementation
- `packages/mcp/core/src/server/http-server.ts` — HTTP-based MCP server
- `packages/mcp/core/src/protocol/messages.ts` — JSON-RPC message types and serialization
- `packages/mcp/core/src/protocol/tools.ts` — Tool call/result protocol handling
- `packages/mcp/core/src/protocol/resources.ts` — Resource read/subscribe protocol
- `packages/mcp/core/src/protocol/prompts.ts` — Prompt template protocol
- `packages/mcp/core/src/protocol/sampling.ts` — LLM sampling protocol support
- `packages/mcp/core/src/protocol/roots.ts` — Filesystem roots protocol
- `packages/mcp/core/src/protocol/logging.ts` — Logging protocol
- `packages/mcp/core/src/protocol/ping.ts` — Health check protocol
- `packages/mcp/core/src/protocol/completion.ts` — Argument completion protocol
- `packages/mcp/core/src/protocol/pagination.ts` — Paginated result protocol
- `packages/mcp/core/src/errors.ts` — MCP-specific error types
- `packages/mcp/core/src/types.ts` — MCP type definitions (JSON Schema-based)
- `packages/mcp/core/src/validation.ts` — Protocol message validation
- `packages/mcp/core/src/config.ts` — MCP configuration management

**Acceptance Criteria**:
- [ ] MCP client connects to stdio-based servers and calls tools successfully
- [ ] MCP client connects to HTTP-based remote servers with authentication
- [ ] MCP client connects to WebSocket-based servers with persistent session
- [ ] MCP server runner spawns, monitors, and gracefully terminates server processes
- [ ] Tool call protocol correctly marshals and unmarshals JSON-RPC requests/responses
- [ ] Resource protocol supports URI-based resource access with subscribe/notify pattern
- [ ] Prompt template protocol retrieves and executes prompt templates from servers
- [ ] Sampling protocol allows servers to request LLM completions from client
- [ ] Filesystem roots protocol allows servers to announce their file access scope
- [ ] All protocol messages pass JSON Schema validation
- [ ] Error types provide structured error information for debugging
- [ ] Configuration loading supports TOML/YAML/JSON formats for MCP server definitions

**Risk Level**: MEDIUM — MCP specification is evolving (current version 2025-03-26); transport implementations must handle process failures gracefully; JSON-RPC message ordering must be preserved for request/response matching; WebSocket reconnection logic required for network interruptions

---

#### Subphase 22.2: Import gemini-cli MCP Integration (mcp-client, mcp-tool, mcp-prompts)
**Week**: 2
**Description**: Port gemini-cli's MCP integration packages, which provide a TypeScript-native MCP client implementation with additional features beyond Goose's Rust implementation. gemini-cli's `mcp-client` package includes configurable MCP server definitions, tool call aggregation with interleaved execution, resource management with list/read/subscribe operations, and prompt template handling. The `mcp-tool` package wraps MCP tool calls as invocable tools within the agent loop, allowing seamless integration of MCP tools alongside built-in tools. The `mcp-prompts` package surfaces MCP prompt templates as agent prompt strategies. gemini-cli's implementation excels at concurrent tool execution, handling multiple MCP tool calls in parallel and interleaving their streaming responses. This subphase merges these TypeScript-native implementations with Goose's Rust-based MCP core, creating a hybrid architecture where the Rust core handles protocol parsing and transport while TypeScript handles tool orchestration and user-facing features.

**Copy Source**: `gemini-cli/packages/core/src/mcp/` → `packages/mcp/client/`

**Key Files to Create/Modify**:
- `packages/mcp/client/src/mcp-client.ts` — Enhanced MCP client (from gemini-cli mcp-client)
- `packages/mcp/client/src/mcp-server-config.ts` — MCP server configuration management
- `packages/mcp/client/src/mcp-tool.ts` — MCP tool wrapper for agent integration (from mcp-tool)
- `packages/mcp/client/src/mcp-prompts.ts` — MCP prompt template integration (from mcp-prompts)
- `packages/mcp/client/src/mcp-resource.ts` — MCP resource integration
- `packages/mcp/client/src/mcp-tool-aggregator.ts` — Tool call aggregation with interleaving
- `packages/mcp/client/src/mcp-tool-executor.ts` — Concurrent tool execution with streaming
- `packages/mcp/client/src/mcp-resource-manager.ts` — Resource caching and subscription
- `packages/mcp/client/src/mcp-session.ts` — MCP session management
- `packages/mcp/client/src/mcp-error-handler.ts` — Error recovery and retry logic
- `packages/mcp/client/src/transports/stdio.ts` — Enhanced stdio transport with reconnection
- `packages/mcp/client/src/transports/http.ts` — Enhanced HTTP transport with retry
- `packages/mcp/client/src/transports/websocket.ts` — Enhanced WebSocket transport
- `packages/mcp/client/src/utils/mcp-path.ts` — MCP server path resolution
- `packages/mcp/client/src/utils/mcp-validator.ts` — Enhanced message validation
- `packages/mcp/client/src/utils/mcp-logger.ts` — MCP-specific logging
- `packages/mcp/client/types/mcp.types.ts` — Extended MCP type definitions
- `packages/mcp/client/types/mcp-server.types.ts` — MCP server config types

**Acceptance Criteria**:
- [ ] MCP client connects to all servers defined in configuration with proper error reporting
- [ ] MCP tool wrapper makes MCP tools callable through the standard agent tool interface
- [ ] MCP prompt templates are surfaced as agent-available prompt strategies
- [ ] Concurrent tool execution runs independent MCP tool calls in parallel
- [ ] Interleaved streaming shows partial results from concurrent tools as they arrive
- [ ] Resource caching prevents redundant reads of unchanged resources
- [ ] Error recovery retries failed tool calls with configurable backoff strategy
- [ ] MCP server config supports inline definitions, file references, and environment variables
- [ ] Session management tracks MCP server connections and handles graceful shutdown
- [ ] All transport implementations support configurable timeouts and keep-alive

**Risk Level**: MEDIUM — Concurrent tool execution requires careful state management; interleaved streaming responses need proper ordering for coherent output; MCP server process management must handle zombie processes; configuration merging between Goose and gemini-cli formats requires backward compatibility

---

#### Subphase 22.3: Import gemini-cli MCP OAuth Provider System
**Week**: 3
**Description**: Port gemini-cli's MCP OAuth provider system, which enables MCP servers to authenticate using OAuth 2.0 flows (authorization code, device code, and client credentials). This subsystem manages OAuth provider registration, token acquisition, token refresh, and secure token storage using the system keychain (via keytar for passwords/API keys). The OAuth integration is critical for remote MCP servers that require authentication (e.g., GitHub MCP, Google Drive MCP, Slack MCP). The system supports the full OAuth 2.0 authorization code flow with PKCE, device authorization flow for headless environments (CLI/TUI), and client credentials flow for server-to-server communication. Tokens are encrypted at rest using platform-native secret storage (macOS Keychain, Windows Credential Manager, Linux Secret Service via libsecret). The OAuth provider registry maps MCP server URIs to their OAuth configurations.

**Copy Source**: `gemini-cli/packages/core/src/mcp/oauth/` → `packages/mcp/oauth/`

**Key Files to Create/Modify**:
- `packages/mcp/oauth/src/index.ts` — MCP OAuth system entry
- `packages/mcp/oauth/src/oauth-provider-registry.ts` — OAuth provider registration
- `packages/mcp/oauth/src/authorization-code-flow.ts` — Auth code flow with PKCE
- `packages/mcp/oauth/src/device-code-flow.ts` — Device authorization flow for CLI/TUI
- `packages/mcp/oauth/src/client-credentials-flow.ts` — Client credentials flow
- `packages/mcp/oauth/src/token-manager.ts` — Token lifecycle management
- `packages/mcp/oauth/src/token-storage.ts` — Encrypted token storage using keytar
- `packages/mcp/oauth/src/token-refresh.ts` — Automatic token refresh with retry
- `packages/mcp/oauth/src/auth-code-server.ts` — Local HTTP server for auth code callbacks
- `packages/mcp/oauth/src/device-code-client.ts` — Device code polling client
- `packages/mcp/oauth/src/pkce-utils.ts` — PKCE code verifier/challenge generation
- `packages/mcp/oauth/src/jwt-validator.ts` — JWT token validation (optional)
- `packages/mcp/oauth/src/types.ts` — OAuth configuration types
- `packages/mcp/oauth/providers/` — Built-in OAuth provider configs
- `packages/mcp/oauth/providers/github.json` — GitHub OAuth configuration
- `packages/mcp/oauth/providers/google.json` — Google OAuth configuration
- `packages/mcp/oauth/providers/slack.json` — Slack OAuth configuration
- `packages/mcp/oauth/providers/microsoft.json` — Microsoft OAuth configuration
- `packages/mcp/client/src/mcp-auth-middleware.ts` — Auth middleware for MCP client
- `apps/cli/src/commands/mcp-auth.ts` — CLI commands: `agentic mcp auth login/logout/list`

**Acceptance Criteria**:
- [ ] Authorization code flow with PKCE completes end-to-end for GitHub MCP
- [ ] Device code flow works in headless CLI/TUI environments
- [ ] Client credentials flow works for automated/server scenarios
- [ ] Token storage securely persists tokens in platform keychain
- [ ] Token refresh automatically refreshes expired tokens without user intervention
- [ ] Auth code callback server handles redirects on localhost with proper ports
- [ ] Device code polling correctly handles authorization_pending and slow_down responses
- [ ] Multiple provider configurations coexist without conflicts
- [ ] CLI `mcp auth login <server>` initiates OAuth flow and stores token
- [ ] CLI `mcp auth list` shows authenticated MCP servers with token expiration
- [ ] CLI `mcp auth logout <server>` revokes token and removes from storage
- [ ] MCP client automatically attaches auth headers to authenticated requests

**Risk Level**: MEDIUM — OAuth flows are security-critical and must be implemented correctly; localhost callback server has port conflicts and firewall implications; keytar native bindings may fail on some Linux distributions; device code polling UX must handle long wait times gracefully; token storage encryption requires platform-specific implementations

---

#### Subphase 22.4: Implement Unified MCP Registry and Discovery
**Week**: 4
**Description**: Build a unified MCP registry and discovery system that allows users to find, install, configure, and manage MCP servers from multiple sources. The registry aggregates MCP servers from: the official MCP registry (community-maintained list at github.com/modelcontextprotocol/servers), npm packages with `mcp-server` keywords, GitHub repositories with MCP server configurations, local filesystem paths, and user-defined custom registries. The discovery subsystem provides search by capability (chat, code, files, database, browser, etc.), by provider (official, community, verified), and by transport type (stdio, HTTP, WebSocket). Server configurations include metadata (description, homepage, license, author), installation instructions (npm install, pip install, binary download, Docker pull), transport configuration, environment variables, authentication requirements, and tool/resource/prompt listings. The registry caches server metadata locally with periodic updates, and supports offline mode with cached server definitions.

**Copy Source**: New subsystem (inspired by `goose_repo/crates/goose/src/extensions/` + `gemini-cli/packages/core/src/mcp/mcp-registry.ts`)

**Key Files to Create/Modify**:
- `packages/mcp/registry/src/index.ts` — MCP registry entry
- `packages/mcp/registry/src/registry-store.ts` — Registry storage (SQLite)
- `packages/mcp/registry/src/official-registry.ts` — Official MCP registry integration
- `packages/mcp/registry/src/npm-discovery.ts` — npm package discovery for MCP servers
- `packages/mcp/registry/src/github-discovery.ts` — GitHub repository discovery
- `packages/mcp/registry/src/filesystem-discovery.ts` — Local filesystem discovery
- `packages/mcp/registry/src/custom-registry.ts` — User-defined registry support
- `packages/mcp/registry/src/search.ts` — Full-text search across registry
- `packages/mcp/registry/src/installer.ts` — MCP server installation (npm, pip, binary)
- `packages/mcp/registry/src/config-generator.ts` — Automatic MCP config generation
- `packages/mcp/registry/src/metadata-parser.ts` — MCP server metadata extraction
- `packages/mcp/registry/src/cache-manager.ts` — Registry cache with offline support
- `packages/mcp/registry/src/health-check.ts` — MCP server health and version checking
- `packages/mcp/registry/src/types.ts` — Registry entry types
- `packages/mcp/registry/schema.sql` — Registry database schema
- `packages/mcp/registry/default-servers.json` — Recommended MCP servers
- `apps/cli/src/commands/mcp-registry.ts` — CLI commands: `agentic mcp search/install/list/update/remove`

**Acceptance Criteria**:
- [ ] Registry discovers MCP servers from official list, npm, GitHub, and local paths
- [ ] Full-text search returns relevant results ranked by popularity and relevance
- [ ] Server installation supports npm install, pip install, binary download, and Docker
- [ ] Config generator automatically creates correct MCP configuration for installed server
- [ ] Registry cache works offline with last-known-good server definitions
- [ ] Health check verifies installed MCP servers are running correct versions
- [ ] Metadata parser extracts tools, resources, and prompts from server manifest
- [ ] Server updates check for newer versions and notify users
- [ ] CLI `mcp search` shows results with description, transport, and star rating
- [ ] CLI `mcp install` downloads, configures, and starts the MCP server
- [ ] CLI `mcp list` shows installed servers with health status
- [ ] Registry updates automatically on schedule or on explicit command

**Risk Level**: LOW-MEDIUM — Registry data sources may have varying quality; npm/GitHub API rate limits; offline cache staleness could lead to outdated server definitions; installation methods vary by platform (Windows vs macOS vs Linux); Docker-based servers require Docker to be installed

---

#### Subphase 22.5: Implement MCP Tool Sandboxing and Security
**Week**: 5
**Description**: Build a comprehensive security layer around MCP tool execution to prevent malicious or buggy MCP servers from compromising the host system. This subsystem implements the principle of least privilege for every MCP server: each server runs in a restricted environment with controlled access to filesystem, network, process spawning, and system resources. The security layer includes: capability-based permissions (read/write/execute policies per server), filesystem access controls (sandboxed directories with read/write/block rules), network access controls (allow/deny lists for host:port combinations), process execution controls (allowed binary paths), resource limits (memory, CPU, file descriptors), and audit logging (all tool calls recorded with inputs, outputs, and timestamps). The sandboxing integrates with the existing Agentic OS V3 WASM sandbox and gemini-cli's sandbox system to provide layered security. A policy engine evaluates each tool call against the server's permission set before execution, with configurable actions: allow, deny, ask-user, or escalate.

**Copy Source**: New subsystem (combining `goose_repo/crates/goose/src/security/` + `gemini-cli/packages/core/src/policy/` + Agentic OS V3 sandbox concepts)

**Key Files to Create/Modify**:
- `packages/mcp/security/src/index.ts` — MCP security entry
- `packages/mcp/security/src/permission-engine.ts` — Capability-based permission evaluation
- `packages/mcp/security/src/filesystem-sandbox.ts` — Filesystem access controls
- `packages/mcp/security/src/network-sandbox.ts` — Network access controls
- `packages/mcp/security/src/process-sandbox.ts` — Process execution controls
- `packages/mcp/security/src/resource-limiter.ts` — CPU/memory/file descriptor limits
- `packages/mcp/security/src/audit-logger.ts` — Tool call audit trail
- `packages/mcp/security/src/policy-evaluator.ts` — Policy evaluation with allow/deny/ask/escalate
- `packages/mcp/security/src/sandbox-proxy.ts` — Sandboxing proxy for MCP communication
- `packages/mcp/security/src/capability-manifest.ts` — Server capability declaration
- `packages/mcp/security/src/trust-store.ts` — Server trust management (trusted/unknown/untrusted)
- `packages/mcp/security/src/types.ts` — Security policy types
- `packages/mcp/security/policies/default-deny.json` — Default deny-all policy
- `packages/mcp/security/policies/default-allow.json` — Default allow policy for trusted servers
- `packages/mcp/security/policies/templates/filesystem.json` — Filesystem access policy template
- `packages/mcp/security/policies/templates/network.json` — Network access policy template
- `packages/mcp/client/src/mcp-security-middleware.ts` — Security middleware integration
- `apps/cli/src/commands/mcp-security.ts` — CLI commands: `agentic mcp security audit/policy/trust`
- `packages/config/src/schemas/mcp-security.ts` — Security configuration schema

**Acceptance Criteria**:
- [ ] Permission engine correctly evaluates allow/deny/ask/escalate for each tool call
- [ ] Filesystem sandbox prevents MCP servers from reading/writing outside allowed paths
- [ ] Network sandbox blocks unauthorized outbound connections from MCP servers
- [ ] Process sandbox prevents MCP servers from executing arbitrary binaries
- [ ] Resource limiter enforces memory and CPU limits on MCP server processes
- [ ] Audit logger records all tool calls with JSON-structured entries
- [ ] Capability manifest validates server capabilities against declared permissions
- [ ] Trust store manages server trust levels with user confirmation for unknown servers
- [ ] Ask action prompts user for approval with full tool call details
- [ ] Escalate action sends alert to configured security monitoring endpoint
- [ ] CLI `mcp security audit <server>` generates security audit report
- [ ] CLI `mcp security trust <server>` adds server to trusted list
- [ ] Security policies are composable (combine filesystem + network + process policies)
- [ ] Default policy is deny-all for newly discovered MCP servers

**Risk Level**: MEDIUM-HIGH — Security sandboxing must be provably correct with no bypasses; filesystem sandbox on Windows requires different implementation than Unix; process sandbox requires OS-level primitives (seccomp, AppArmor, Windows Job Objects); resource limiting must handle both direct and child processes; audit log must not become a performance bottleneck; ask-user flow must be non-blocking for streaming scenarios

---

## Phase 23: Extension & Recipe System
**Duration**: 5 weeks
**Dependencies**: Phase 4 (Recipe & Skill Unification), Phase 22 (MCP & Tool Ecosystem)
**Overall Risk**: MEDIUM — Multiple extension paradigms must be unified without breaking existing extensions

### Overview
Phase 23 merges three distinct extension/recipe paradigms into a unified system: **Goose's WASM-based extensions** (Rust + WASM compiled extensions), **Goose's YAML recipe engine** (declarative workflow recipes), and **gemini-cli's hooks system** (event-driven hook aggregator/planner/runner). The unified system presents a single "extension" concept with multiple implementation types, a unified recipe format that builds on Goose's proven YAML recipes while adding gemini-cli's hook-driven workflow capabilities, and an extension marketplace with versioning and dependency management.

---

#### Subphase 23.1: Import Goose Extension System (Rust + WASM)
**Week**: 1
**Description**: Port Goose's extension system from its Rust implementation (`crates/goose/src/extensions/`) into the unified monorepo. Goose's extension system allows developers to create extensions as WASM modules compiled from Rust, C/C++, or any language targeting WASI. The extension manager handles loading, sandboxing, and communicating with WASM-based extensions through a well-defined ABI (Application Binary Interface). Each extension exposes tools, resources, and prompts that integrate into the agent loop. The extension lifecycle includes registration, loading, initialization, execution, and cleanup. Extensions can be installed from local files, URLs, or package registries. The system includes malware checking for extension binaries, signature verification for signed extensions, and a manifest system for declaring extension capabilities and dependencies. This subphase adapts the Rust-native extension system to work within the unified monorepo's hybrid Rust/TypeScript architecture.

**Copy Source**: `goose_repo/crates/goose/src/extensions/` → `packages/extensions/wasm/`

**Key Files to Create/Modify**:
- `packages/extensions/wasm/Cargo.toml` — Rust crate with WASM runtime deps
- `packages/extensions/wasm/src/lib.rs` — Extension system main entry
- `packages/extensions/wasm/src/manager.rs` — ExtensionManager: load/unload/lifecycle (from manager.rs)
- `packages/extensions/wasm/src/loader.rs` — WASM module loader with verification (from loader.rs)
- `packages/extensions/wasm/src/runtime.rs` — WASM runtime (wasmtime/wasmer) integration
- `packages/extensions/wasm/src/abi.rs` — Extension ABI protocol definition
- `packages/extensions/wasm/src/sandbox.rs` — WASM sandbox with resource limits
- `packages/extensions/wasm/src/malware_check.rs` — Extension binary scanning (from malware_check.rs)
- `packages/extensions/wasm/src/signature.rs` — Extension signature verification
- `packages/extensions/wasm/src/manifest.rs` — Extension manifest parsing and validation
- `packages/extensions/wasm/src/registry.rs` — Extension directory registry
- `packages/extensions/wasm/src/types.rs` — Extension type definitions
- `packages/extensions/wasm/src/errors.rs` — Extension-specific error types
- `packages/extensions/wasm/sdk/` — WASM extension SDK for Rust developers
- `packages/extensions/wasm/sdk/agentic-extension-sdk/` — Rust crate for building extensions
- `packages/extensions/wasm/sdk/agentic-extension-sdk/src/lib.rs` — SDK entry with tool/resource/prompt macros
- `packages/extensions/wasm/sdk/agentic-extension-sdk/src/tool.rs` — Tool definition helper
- `packages/extensions/wasm/sdk/agentic-extension-sdk/src/resource.rs` — Resource definition helper
- `packages/extensions/wasm/sdk/examples/` — Example WASM extensions
- `packages/extensions/wasm/sdk/examples/hello-world/` — Basic example
- `packages/extensions/wasm/sdk/examples/calculator/` — Tool example
- `packages/extensions/wasm/sdk/examples/file-reader/` — Resource example
- `packages/extensions/wasm/sdk/extension-manifest.json` — Extension manifest schema
- `packages/extensions/wasm/src/napi/bridge.rs` — napi-rs bridge for TypeScript interop
- `packages/extensions/wasm/src/napi/mod.rs` — napi module initialization
- `packages/extensions/wasm/npm/` — npm package for TypeScript consumers
- `packages/extensions/wasm/npm/index.js` — JS wrapper for napi native addon

**Acceptance Criteria**:
- [ ] WASM extension loads, initializes, and exposes tools/resources/prompts
- [ ] Extension manager handles lifecycle: register → load → init → execute → cleanup
- [ ] WASM runtime (wasmtime) executes extensions with resource limits (memory, CPU time)
- [ ] Malware check scans extension binaries for known malicious patterns
- [ ] Signature verification validates extension publisher signatures
- [ ] Extension manifest correctly declares capabilities, dependencies, and permissions
- [ ] ABI protocol enables bidirectional communication between extension and host
- [ ] SDK compiles example extensions that work with the extension manager
- [ ] napi-rs bridge exposes all extension manager functions to TypeScript
- [ ] npm package allows JavaScript/TypeScript code to load and use WASM extensions
- [ ] Extension sandbox prevents extensions from accessing unauthorized system resources

**Risk Level**: HIGH — WASM runtime integration (wasmtime) has platform-specific compilation requirements; ABI protocol design must be forward-compatible for future extension capabilities; malware checking must balance thoroughness with performance; signature verification requires public key infrastructure; napi-rs bridge adds complexity to the Rust/TypeScript boundary

---

#### Subphase 23.2: Import Goose Recipe Engine (YAML Recipes)
**Week**: 2
**Description**: Port Goose's YAML recipe engine from its Rust implementation (`crates/goose/src/recipe/`) into the unified monorepo. Goose's recipe engine enables declarative workflow definitions using YAML, where each recipe defines a sequence of steps that can include LLM prompts, tool calls, conditional branching, subrecipe execution, and parameterized inputs. Recipes support multi-turn interactions where each step can use output from previous steps, loop over collections, conditionally skip steps, and handle errors with retry/fallback/abort policies. The recipe format also supports subrecipes — reusable recipe fragments that can be composed into larger workflows. Built-in recipes include code review, app creation, research synthesis, document generation, and system diagnostics. The engine includes validation, parameter substitution, step execution with streaming output, and result aggregation. This subphase ports the engine to TypeScript while maintaining full compatibility with the existing YAML recipe format.

**Copy Source**: `goose_repo/crates/goose/src/recipe/` → `packages/extensions/recipes/`

**Key Files to Create/Modify**:
- `packages/extensions/recipes/src/index.ts` — Recipe engine entry
- `packages/extensions/recipes/src/engine.ts` — RecipeExecutor: run recipes (from recipe.rs)
- `packages/extensions/recipes/src/parser.ts` — YAML recipe parser with schema validation
- `packages/extensions/recipes/src/validator.ts` — Recipe validation (from validate_recipe.rs)
- `packages/extensions/recipes/src/step-executor.ts` — Step execution with prompt/tool/recipe steps
- `packages/extensions/recipes/src/subrecipe.ts` — Subrecipe loader and executer
- `packages/extensions/recipes/src/parameter-resolver.ts` — Parameter substitution with context
- `packages/extensions/recipes/src/conditional.ts` — Conditional step execution (if/unless)
- `packages/extensions/recipes/src/looping.ts` — Loop/forEach step execution
- `packages/extensions/recipes/src/error-handler.ts` — Error handling with retry/fallback/abort
- `packages/extensions/recipes/src/streaming.ts` — Streaming step output for real-time UX
- `packages/extensions/recipes/src/context.ts` — Recipe execution context
- `packages/extensions/recipes/src/result-aggregator.ts` — Step result aggregation and transformation
- `packages/extensions/recipes/src/recipe-discovery.ts` — Recipe discovery (local, git, registry)
- `packages/extensions/recipes/src/recipe-cache.ts` — Recipe caching for frequently used recipes
- `packages/extensions/recipes/src/types.ts` — Recipe type definitions (step, recipe, config)
- `packages/extensions/recipes/schema/recipe.schema.json` — JSON Schema for recipe validation
- `packages/extensions/recipes/builtins/code-review.yaml` — Built-in code review recipe
- `packages/extensions/recipes/builtins/create-app.yaml` — Built-in app creation recipe
- `packages/extensions/recipes/builtins/research.yaml` — Built-in research synthesis recipe
- `packages/extensions/recipes/builtins/document.yaml` — Built-in document generation recipe
- `packages/extensions/recipes/builtins/diagnostics.yaml` — Built-in system diagnostics recipe
- `packages/extensions/recipes/builtins/debug.yaml` — Built-in debugging recipe
- `packages/extensions/recipes/templates/` — Recipe template library
- `apps/cli/src/commands/recipe.ts` — CLI commands: `agentic recipe run/create/validate/list`

**Acceptance Criteria**:
- [ ] Engine parses and validates existing Goose YAML recipes without modification
- [ ] Multi-step recipes execute sequentially with correct parameter passing between steps
- [ ] Subrecipe execution nests recipe calls with proper scoping
- [ ] Conditional steps (if/unless) skip or execute based on context evaluation
- [ ] Loop steps iterate over collections with per-item context
- [ ] Error handling retries failed steps with configurable backoff, falls back, or aborts
- [ ] Streaming output shows step results in real-time as they complete
- [ ] Parameter substitution resolves template variables from recipe context
- [ ] Built-in recipes execute successfully end-to-end
- [ ] Recipe discovery finds recipes from local dir, git repos, and registry
- [ ] CLI `recipe run` executes recipe with parameterized inputs
- [ ] CLI `recipe validate` reports schema violations with line-level detail
- [ ] CLI `recipe create` scaffolds new recipe from template
- [ ] Recipe cache improves cold-start time for frequently used recipes

**Risk Level**: LOW-MEDIUM — Recipe format is well-defined with existing users; YAML parsing is straightforward; TypeScript port is relatively mechanical; subrecipe scoping and error handling have edge cases but are solvable; the main risk is maintaining backward compatibility with existing Goose recipes

---

#### Subphase 23.3: Import gemini-cli Hooks System (Hook Aggregator, Planner, Runner)
**Week**: 3
**Description**: Port gemini-cli's hooks system, which provides an event-driven extension mechanism that complements Goose's recipe engine. The hooks system defines lifecycle events throughout the agent loop (beforeAgent, afterAgent, beforeModel, afterModel, beforeTool, afterTool, beforeToolSelection, beforeToolStop, sessionStartup, sessionClear) and allows hook handlers to modify behavior at each point. The system has three components: the **Hook Aggregator** collects all registered hooks from configuration, installed plugins, and built-in handlers; the **Hook Planner** determines the execution order of hooks for each event (respecting priority, dependencies, and exclusive groups); and the **Hook Runner** executes hook handlers with proper sequencing, error isolation (a failing hook doesn't crash the agent), and timeout enforcement. Hooks can modify inputs, block actions, append context, transform outputs, emit telemetry, and implement custom policies. This subphase merges the hooks system with Goose's recipe engine to create a unified event+workflow extension platform.

**Copy Source**: `gemini-cli/packages/core/src/hooks/` → `packages/extensions/hooks/`

**Key Files to Create/Modify**:
- `packages/extensions/hooks/src/index.ts` — Hooks system entry
- `packages/extensions/hooks/src/aggregator.ts` — Hook aggregator: collects all hook registrations
- `packages/extensions/hooks/src/planner.ts` — Hook planner: determines execution order per event
- `packages/extensions/hooks/src/runner.ts` — Hook runner: executes hooks with isolation
- `packages/extensions/hooks/src/registry.ts` — Hook registration and discovery
- `packages/extensions/hooks/src/events.ts` — Event type definitions and constants
- `packages/extensions/hooks/src/context.ts` — Hook execution context
- `packages/extensions/hooks/src/timeout.ts` — Hook timeout enforcement
- `packages/extensions/hooks/src/error-handler.ts` — Error isolation for failing hooks
- `packages/extensions/hooks/src/priority.ts` — Priority-based ordering
- `packages/extensions/hooks/src/dependencies.ts` — Hook dependency resolution
- `packages/extensions/hooks/src/exclusive-groups.ts` — Mutually exclusive hook groups
- `packages/extensions/hooks/src/builtins/before-tool-confirm.ts` — Built-in tool confirmation hook
- `packages/extensions/hooks/src/builtins/after-model-cache.ts` — Built-in response cache hook
- `packages/extensions/hooks/src/builtins/before-agent-policy.ts` — Built-in policy enforcement hook
- `packages/extensions/hooks/src/builtins/after-tool-telemetry.ts` — Built-in telemetry hook
- `packages/extensions/hooks/src/builtins/session-startup.ts` — Built-in session initialization hook
- `packages/extensions/hooks/src/types.ts` — Hook definition types
- `packages/extensions/hooks/schema/hooks-config.schema.json` — Hooks configuration schema
- `packages/extensions/unified/src/bridge.ts` — Bridge between hooks and recipe systems
- `packages/config/src/schemas/hooks.ts` — Hooks configuration schema
- `apps/cli/src/commands/hooks.ts` — CLI commands: `agentic hooks list/enable/disable/log`

**Acceptance Criteria**:
- [ ] Hook aggregator collects hooks from config, plugins, and built-in sources
- [ ] Hook planner determines correct execution order for all defined events
- [ ] Hook runner executes hooks with proper isolation (one failing hook doesn't affect others)
- [ ] Timeout enforcement terminates long-running hooks after configurable duration
- [ ] All agent loop events fire hooks with complete context (beforeAgent, afterModel, beforeTool, etc.)
- [ ] Hooks can modify inputs, block actions, append context, and emit telemetry
- [ ] Priority system ensures high-priority hooks run before low-priority ones
- [ ] Dependency resolution ensures hooks run after their dependencies
- [ ] Exclusive groups prevent conflicting hooks from running together
- [ ] Built-in hooks provide tool confirmation, response caching, policy enforcement, and telemetry
- [ ] Bridge system allows hooks to trigger recipe execution and vice versa
- [ ] CLI `hooks list` shows registered hooks with priority and event
- [ ] CLI `hooks enable/disable` toggles hooks at runtime
- [ ] Hooks configuration merges with recipe configuration for unified extension management

**Risk Level**: MEDIUM — Event-driven hook systems are inherently complex with execution ordering edge cases; hook isolation must prevent state corruption across handlers; timeout enforcement must handle both async and sync hooks; bridge system between hooks and recipes must avoid circular execution; performance overhead of hook execution must be minimal (<5ms per event)

---

#### Subphase 23.4: Implement Unified Extension Marketplace Format
**Week**: 4
**Description**: Design and implement a unified extension marketplace format that encompasses all extension types: WASM extensions, YAML recipes, hooks plugins, MCP servers, skill packages, and TUI plugins. The marketplace format defines a standard extension manifest with fields for metadata (name, version, description, author, license), capabilities (tools, resources, prompts, hooks, recipes), dependencies (other extensions, MCP servers, system requirements), installation (package type, registry URL, checksum), configuration (default config, required settings, environment variables), and distribution (registry endpoints, update URLs, signing keys). The marketplace client supports searching, browsing, installing, updating, and removing extensions from one or more marketplace registries. A built-in "curated" marketplace provides vetted extensions, while users can add third-party registries. The extension format is forward-compatible, allowing new extension types to be added without breaking existing installers.

**Copy Source**: New subsystem (combining `goose_repo/crates/goose/src/extensions/` manifest format + `gemini-cli/packages/core/src/extensions/` + Agentic OS V3 skill registry)

**Key Files to Create/Modify**:
- `packages/extensions/marketplace/src/index.ts` — Marketplace entry
- `packages/extensions/marketplace/src/extension-manifest.ts` — Unified manifest format definition
- `packages/extensions/marketplace/src/manifest-validator.ts` — Manifest schema validation
- `packages/extensions/marketplace/src/manifest-converter.ts` — Legacy manifest converter (Goose/gemini-cli/V3)
- `packages/extensions/marketplace/src/marketplace-client.ts` — Marketplace API client
- `packages/extensions/marketplace/src/marketplace-registry.ts` — Registry management (add/remove/list)
- `packages/extensions/marketplace/src/curated-registry.ts` — Built-in curated extension list
- `packages/extensions/marketplace/src/installer.ts` — Unified extension installer
- `packages/extensions/marketplace/src/updater.ts` — Extension update checker
- `packages/extensions/marketplace/src/uninstaller.ts` — Extension removal
- `packages/extensions/marketplace/src/search.ts` — Full-text search across registries
- `packages/extensions/marketplace/src/categorization.ts` — Extension categorization and tagging
- `packages/extensions/marketplace/src/ratings.ts` — User ratings and reviews (optional)
- `packages/extensions/marketplace/src/types.ts` — Marketplace type definitions
- `packages/extensions/marketplace/schema/extension-manifest.schema.json` — JSON Schema for manifest
- `packages/extensions/marketplace/schema/marketplace-config.schema.json` — Marketplace config schema
- `packages/extensions/marketplace/default-manifests/` — Example manifests for each extension type
- `packages/extensions/marketplace/default-manifests/wasm-extension.json` — WASM extension example
- `packages/extensions/marketplace/default-manifests/recipe-package.json` — Recipe package example
- `packages/extensions/marketplace/default-manifests/hooks-plugin.json` — Hooks plugin example
- `packages/extensions/marketplace/default-manifests/mcp-server.json` — MCP server example
- `packages/extensions/marketplace/default-manifests/skill-package.json` — Skill package example
- `apps/cli/src/commands/extension.ts` — CLI commands: `agentic extension search/install/update/remove/list`

**Acceptance Criteria**:
- [ ] Unified manifest format accommodates WASM extensions, recipes, hooks, MCP servers, and skills
- [ ] Manifest validator enforces schema with detailed error messages for invalid fields
- [ ] Manifest converter transforms legacy Goose, gemini-cli, and V3 manifests to unified format
- [ ] Marketplace client searches across multiple registries with unified results
- [ ] Registry management supports adding custom/private registries URL
- [ ] Curated registry contains at least 20 vetted extensions at launch
- [ ] Installer correctly handles all extension types (WASM, recipe, hooks, MCP, skill)
- [ ] Update checker compares installed versions against registry with semver compatibility
- [ ] Uninstaller cleanly removes extensions and their side-effects (config, cache, processes)
- [ ] Full-text search indexes extension name, description, tags, and capabilities
- [ ] Categorization organizes extensions by type, capability, and use case
- [ ] CLI `extension search` returns formatted results with relevance scoring
- [ ] CLI `extension install` manages dependencies automatically
- [ ] CLI `extension list` shows installed extensions with version and health status

**Risk Level**: LOW-MEDIUM — Format design requires buy-in from all extension author communities; manifest converter must handle edge cases in legacy formats; marketplace API design must be simple enough for third-party registries to implement; dependency resolution may introduce complexity for conflicting extensions; ratings system requires user authentication infrastructure

---

#### Subphase 23.5: Implement Extension Versioning and Dependency Management
**Week**: 5
**Description**: Build a robust versioning and dependency management system for the unified extension ecosystem. This subsystem handles semantic versioning (semver) for all extension types, dependency resolution with conflict detection, transitive dependency installation, version pinning, and lock files for reproducible installations. The dependency resolver constructs a dependency graph from extension manifests, detects version conflicts (two extensions requiring incompatible versions of the same dependency), and selects a compatible set using a SAT solver or backtracking algorithm. The system supports version constraints (^1.2.3, >=2.0.0 <3.0.0, ~1.0.0), optional dependencies, platform-specific dependencies (Windows vs macOS vs Linux), and peer dependencies (an extension requiring specific host capabilities). Extension bundles (versioned, signed archives containing the extension and all its dependencies) enable offline installation and distribution. A lock file (`extensions.lock.json`) ensures reproducible extension environments across machines.

**Copy Source**: New subsystem (inspired by npm/pnpm package management patterns + `goose_repo/crates/goose/src/extensions/` versioning + gemini-cli's package management)

**Key Files to Create/Modify**:
- `packages/extensions/versioning/src/index.ts` — Versioning system entry
- `packages/extensions/versioning/src/semver.ts` — Semantic versioning utilities
- `packages/extensions/versioning/src/dependency-resolver.ts` — Dependency graph resolution
- `packages/extensions/versioning/src/conflict-detector.ts` — Version conflict detection
- `packages/extensions/versioning/src/sat-solver.ts` — SAT-based dependency resolution
- `packages/extensions/versioning/src/lock-file.ts` — Lock file generation and verification
- `packages/extensions/versioning/src/version-pinner.ts` — Version pinning strategies
- `packages/extensions/versioning/src/transitive-installer.ts` — Transitive dependency installation
- `packages/extensions/versioning/src/platform-checker.ts` — Platform compatibility checking
- `packages/extensions/versioning/src/peer-deps-resolver.ts` — Peer dependency resolution
- `packages/extensions/versioning/src/optional-deps.ts` — Optional dependency handling
- `packages/extensions/versioning/src/bundle.ts` — Extension bundling (versioned, signed archives)
- `packages/extensions/versioning/src/bundle-signer.ts` — Bundle signing and verification
- `packages/extensions/versioning/src/bundle-extractor.ts` — Bundle extraction and validation
- `packages/extensions/versioning/src/registry-sync.ts` — Registry version index synchronization
- `packages/extensions/versioning/src/cache.ts` — Resolved dependency cache
- `packages/extensions/versioning/src/types.ts` — Versioning type definitions
- `packages/extensions/versioning/schema/extensions.lock.schema.json` — Lock file schema
- `packages/extensions/marketplace/src/dependency-integration.ts` — Marketplace integration
- `apps/cli/src/commands/extension-version.ts` — CLI commands: `agentic extension version pin/check/lock/update`

**Acceptance Criteria**:
- [ ] Semver parser handles all valid formats (^, ~, >=, <=, ranges, pre-release tags)
- [ ] Dependency resolver correctly installs transitive dependencies with correct versions
- [ ] Conflict detector identifies incompatible version requirements with clear error messages
- [ ] SAT solver selects compatible dependency set in <1 second for typical dependency graphs (<100 nodes)
- [ ] Lock file ensures reproducible installations across machines
- [ ] Version pinning supports exact, caret, tilde, and range strategies
- [ ] Platform checker prevents installation of incompatible extensions (Windows-only on macOS)
- [ ] Peer dependency resolution checks host capabilities before installation
- [ ] Optional dependencies gracefully handle missing optional deps
- [ ] Extension bundler creates signed archives for offline installation
- [ ] Bundle verification checks signature, integrity, and expiration
- [ ] Registry sync maintains local version index with availability info
- [ ] Resolved dependency cache avoids redundant resolution for repeated operations
- [ ] CLI `extension version check` reports outdated extensions with upgrade commands
- [ ] CLI `extension version lock` pins all transitive dependencies to current versions
- [ ] CLI `extension version update <ext>` safely updates extension and its dependencies

**Risk Level**: MEDIUM — Dependency resolution is NP-hard in general (SAT solver must handle practical cases efficiently); lock file format must be forward-compatible; bundle signing requires PKI infrastructure; platform-specific dependencies add testing matrix complexity; migration from existing Goose/gemini-cli plugin installations requires dependency reconstruction

---

## Phase 24: Voice & Multimodal
**Duration**: 5 weeks
**Dependencies**: Phase 21 (Local & Edge Inference — for Whisper/STT), Phase 22 (MCP & Tool Ecosystem — for computer control)
**Overall Risk**: MEDIUM — Audio processing has platform-specific challenges; real-time voice requires low-latency audio pipelines; multimodal input handling varies widely by modality

### Overview
Phase 24 integrates voice and multimodal capabilities from Goose and gemini-cli into a unified system. This includes importing Goose's Whisper.cpp dictation for speech-to-text, gemini-cli's voice system (whisper, Gemini Live API, audio recorder), implementing text-to-speech output, building a multimodal input handler that can process images, audio, video, and files, and importing Goose's screen capture and computer control capabilities. The result is a fully voice-enabled agent that can see, hear, speak, and control the computer.

---

#### Subphase 24.1: Import Goose Dictation (Whisper.cpp Integration)
**Week**: 1
**Description**: Port Goose's dictation system from its Rust implementation (`crates/goose/src/dictation/`) into the unified monorepo. Goose's dictation uses Whisper.cpp — a high-performance C++ implementation of OpenAI's Whisper speech recognition model — for real-time speech-to-text. The dictation system supports multiple Whisper model sizes (tiny, base, small, medium, large) with automatic model download on first use. It provides a global hotkey (user-configurable) to start/stop recording, real-time transcription with streaming text output, auto-punctuation, multi-language support (99+ languages), and voice activity detection (VAD) for automatic stop when the user stops speaking. The transcription engine runs locally with GPU acceleration (Metal on Apple Silicon, CUDA on NVIDIA, Vulkan on other GPUs). This subphase integrates the dictation system into the desktop app, CLI, and TUI interfaces, enabling voice input across all interaction modes.

**Copy Source**: `goose_repo/crates/goose/src/dictation/` → `packages/voice/dictation/`

**Key Files to Create/Modify**:
- `packages/voice/dictation/Cargo.toml` — Rust crate for Whisper.cpp bindings
- `packages/voice/dictation/src/lib.rs` — Dictation system entry
- `packages/voice/dictation/src/engine.rs` — Whisper transcription engine (from engine.rs)
- `packages/voice/dictation/src/recorder.rs` — Audio recording module (from recorder.rs)
- `packages/voice/dictation/src/vad.rs` — Voice activity detection (from vad.rs)
- `packages/voice/dictation/src/hotkey.rs` — Global hotkey listener (from hotkey.rs)
- `packages/voice/dictation/src/models.rs` — Model download and management (from models.rs)
- `packages/voice/dictation/src/streaming.rs` — Streaming transcription output
- `packages/voice/dictation/src/auto-punctuation.rs` — Auto-punctuation via language model
- `packages/voice/dictation/src/language.rs` — Multi-language detection and support
- `packages/voice/dictation/src/audio-devices.rs` — Audio device enumeration and selection
- `packages/voice/dictation/src/backends/metal.rs` — Metal GPU backend
- `packages/voice/dictation/src/backends/cuda.rs` — CUDA GPU backend
- `packages/voice/dictation/src/backends/cpu.rs` — CPU-only fallback
- `packages/voice/dictation/build.rs` — Build script for Whisper.cpp compilation
- `packages/voice/dictation/vendor/whisper.cpp/` — Git submodule or vendored whisper.cpp
- `packages/voice/dictation/napi/bridge.rs` — napi-rs bridge for TypeScript
- `packages/voice/dictation/napi/mod.rs` — napi module initialization
- `packages/voice/dictation/npm/index.js` — npm package for dictation
- `packages/voice/dictation/src/types.rs` — Type definitions
- `packages/voice/dictation/src/errors.rs` — Error types
- `packages/voice/dictation/config/default.toml` — Default dictation configuration
- `apps/cli/src/commands/dictate.ts` — CLI command: `agentic dictate` — starts voice dictation
- `apps/desktop/src/hooks/useDictation.ts` — React hook for dictation in desktop app

**Acceptance Criteria**:
- [ ] Whisper.cpp compiles on macOS (arm64, x86_64), Linux, and Windows
- [ ] Base model (tiny.en) downloads automatically on first use
- [ ] Global hotkey (configurable, defaults to Ctrl+Shift+D) starts/stops recording
- [ ] Real-time transcription outputs text as it is recognized (streaming mode)
- [ ] Voice activity detection automatically stops recording after 2 seconds of silence
- [ ] Auto-punctuation inserts periods, commas, and question marks at appropriate locations
- [ ] Multi-language detection correctly identifies and transcribes 20+ languages
- [ ] GPU acceleration (Metal/CUDA) achieves <500ms transcription for 5-second audio
- [ ] CPU-only mode achieves <2s transcription for 5-second audio using tiny model
- [ ] Audio device enumeration lists all available input devices
- [ ] Dictation integrates into CLI as `agentic dictate` with streaming output
- [ ] Dictation integrates into desktop app with voice input button in chat interface
- [ ] Configuration options cover model selection, hotkey, language, and VAD sensitivity

**Risk Level**: HIGH — Whisper.cpp compilation is complex with platform-specific optimizations; global hotkey functionality requires platform-specific implementations (CGEvent on macOS, RegisterHotKey on Windows, evdev on Linux); audio device handling varies significantly between platforms; real-time streaming requires low-latency audio pipeline (<100ms system latency); GPU acceleration adds build complexity

---

#### Subphase 24.2: Import gemini-cli Voice System (Whisper, Gemini Live API, Audio Recorder)
**Week**: 2
**Description**: Port gemini-cli's voice system, which provides a comprehensive voice interaction framework beyond Goose's dictation-only approach. gemini-cli's voice system includes: an **audio recorder** with support for multiple input sources (microphone, system audio, file input); a **Whisper integration** for local speech-to-text using the Node.js `whisper-node` package (complementing Goose's Rust-native implementation); a **Gemini Live API** client for cloud-based real-time voice conversation with the Gemini model (streaming bidirectional audio); and a **conversation manager** that handles turn-taking, interruption, and voice activity. The system supports both push-to-talk and continuous listening modes. This subphase merges gemini-cli's TypeScript-native voice components with Goose's Rust-native dictation to create a unified voice subsystem where users can choose local (Whisper.cpp) or cloud (Gemini Live API, or other provider's voice APIs) speech processing based on their privacy/latency requirements.

**Copy Source**: `gemini-cli/packages/core/src/voice/` → `packages/voice/`

**Key Files to Create/Modify**:
- `packages/voice/audio-recorder/src/index.ts` — Audio recorder entry (from gemini-cli audio recorder)
- `packages/voice/audio-recorder/src/microphone.ts` — Microphone input via getUserMedia/SoX/arecord
- `packages/voice/audio-recorder/src/system-audio.ts` — System audio capture (loopback)
- `packages/voice/audio-recorder/src/file-input.ts` — Audio file input (WAV, MP3, OGG, FLAC)
- `packages/voice/audio-recorder/src/encoder.ts` — Audio encoding (PCM, WAV, Opus)
- `packages/voice/audio-recorder/src/volume-meter.ts` — Real-time volume level visualization
- `packages/voice/audio-recorder/src/types.ts` — Audio configuration types
- `packages/voice/stt-whisper-node/src/index.ts` — Whisper Node.js binding entry
- `packages/voice/stt-whisper-node/src/transcriber.ts` — Local Whisper transcription via whisper-node
- `packages/voice/stt-whisper-node/src/model-manager.ts` — Whisper model management
- `packages/voice/stt-whisper-node/src/language-detect.ts` — Language detection for Whisper
- `packages/voice/stt-whisper-node/src/streaming.ts` — Streaming transcription with timestamp
- `packages/voice/gemini-live/src/index.ts` — Gemini Live API client entry
- `packages/voice/gemini-live/src/live-client.ts` — Bidirectional audio streaming client
- `packages/voice/gemini-live/src/connection-manager.ts` — WebSocket connection management
- `packages/voice/gemini-live/src/audio-codec.ts` — Audio codec handling (Opus, PCM16)
- `packages/voice/gemini-live/src/interruption.ts` — Interruption handling for turn-taking
- `packages/voice/gemini-live/src/types.ts` — Live API types
- `packages/voice/conversation-manager/src/index.ts` — Voice conversation manager
- `packages/voice/conversation-manager/src/turn-taking.ts` — Turn detection and management
- `packages/voice/conversation-manager/src/continuous-listening.ts` — Always-listening mode
- `packages/voice/conversation-manager/src/push-to-talk.ts` — Push-to-talk mode
- `packages/voice/conversation-manager/src/voice-activity.ts` — Advanced VAD with BERT
- `packages/voice/unified/src/index.ts` — Unified voice system entry
- `packages/voice/unified/src/voice-controller.ts` — Voice system orchestrator
- `packages/voice/unified/src/provider-selector.ts` — Local vs cloud STT routing
- `packages/config/src/schemas/voice.ts` — Voice configuration schema
- `apps/desktop/src/hooks/useVoice.ts` — React hook for voice in desktop app

**Acceptance Criteria**:
- [ ] Audio recorder captures microphone input on macOS, Windows, and Linux
- [ ] System audio capture works on macOS (Loopback/Audio Hijack) and Windows (WASAPI loopback)
- [ ] Audio file input supports WAV, MP3, OGG, and FLAC formats
- [ ] Whisper via whisper-node provides alternative STT backend on all platforms
- [ ] Gemini Live API connects, streams audio bidirectionally, and maintains conversation
- [ ] Conversation manager handles turn-taking with interruption support
- [ ] Continuous listening mode maintains low false-positive rate for wake word detection
- [ ] Push-to-talk mode uses user-configurable keybinding
- [ ] Volume meter visualizes input levels in real-time (desktop app)
- [ ] Unified voice controller selects between local Whisper.cpp and cloud Whisper/Gemini Live
- [ ] Local STT backend handles disconnection gracefully (falls back to local)
- [ ] All voice components respect privacy settings (no audio sent to cloud when configured)

**Risk Level**: MEDIUM — Audio capture has platform-specific API differences (CoreAudio on macOS, WASAPI on Windows, PulseAudio/ALSA on Linux); system audio capture requires driver-level access (loopback) which varies by platform; Gemini Live API is Google-specific and may change; bidirectional audio streaming requires stable network connection with low jitter; whisper-node native bindings may require platform-specific build steps

---

#### Subphase 24.3: Implement Text-to-Speech Output
**Week**: 3
**Description**: Implement a comprehensive text-to-speech (TTS) subsystem that can synthesize speech from agent responses across multiple backends. The TTS system supports: **local TTS** using Piper (fast, high-quality neural TTS that runs on CPU), **cloud TTS** via provider APIs (OpenAI TTS, Google Cloud TTS, Amazon Polly, ElevenLabs), and **streaming TTS** that begins audio playback before the full text is synthesized (reducing perceived latency). A unified TTS interface allows seamless backend switching based on quality requirements, latency constraints, and privacy preferences. The system includes voice selection (multiple voices per backend with gender, accent, and style variations), speech rate control, volume normalization, SSML (Speech Synthesis Markup Language) support for fine-grained prosody control, and audio output to multiple destinations (speakers, audio file, WebSocket stream). A voice cache stores recently synthesized audio to avoid redundant API calls.

**Copy Source**: New subsystem (inspired by `goose_repo` TTS concepts + `gemini-cli` potential voice output + open-source Piper TTS)

**Key Files to Create/Modify**:
- `packages/voice/tts/src/index.ts` — TTS system entry
- `packages/voice/tts/src/tts-manager.ts` — Central TTS orchestrator
- `packages/voice/tts/src/backends/piper.ts` — Local Piper TTS backend
- `packages/voice/tts/src/backends/openai.ts` — OpenAI TTS API backend
- `packages/voice/tts/src/backends/google-cloud.ts` — Google Cloud TTS backend
- `packages/voice/tts/src/backends/elevenlabs.ts` — ElevenLabs TTS backend
- `packages/voice/tts/src/backends/amazon-polly.ts` — Amazon Polly TTS backend
- `packages/voice/tts/src/streaming.ts` — Streaming TTS with chunked synthesis
- `packages/voice/tts/src/voice-selector.ts` — Voice selection and management
- `packages/voice/tts/src/speech-rate.ts` — Speech rate control (0.5x to 2.0x)
- `packages/voice/tts/src/ssml-parser.ts` — SSML input parsing and rendering
- `packages/voice/tts/src/audio-playback.ts` — Audio output to speakers
- `packages/voice/tts/src/audio-file-writer.ts` — Audio file output (WAV, MP3, OGG)
- `packages/voice/tts/src/voice-cache.ts` — Voice synthesis cache
- `packages/voice/tts/src/normalizer.ts` — Text normalization for TTS (numbers, dates, abbreviations)
- `packages/voice/tts/src/types.ts` — TTS configuration types
- `packages/voice/tts/models/` — Piper voice model storage
- `packages/voice/tts/models/default-voices.json` — Available voice definitions
- `packages/voice/tts/vendor/piper/` — Piper TTS C++ engine (vendored or submodule)
- `packages/voice/tts/src/napi/bridge.rs` — napi-rs bridge for Piper
- `packages/config/src/schemas/tts.ts` — TTS configuration schema
- `apps/desktop/src/hooks/useTTS.ts` — React hook for TTS in desktop app
- `apps/cli/src/commands/tts.ts` — CLI commands: `agentic tts speak --voice <voice> --text <text>`

**Acceptance Criteria**:
- [ ] Piper local TTS synthesizes speech at >2x realtime on modern CPU
- [ ] OpenAI TTS backend works with all available voices (alloy, echo, fable, nova, shimmer)
- [ ] Google Cloud TTS backend supports WaveNet and Studio voices
- [ ] ElevenLabs backend supports voice cloning and multi-lingual generation
- [ ] Streaming TTS begins playback within 500ms of synthesis start
- [ ] Voice selector allows per-voice configuration of gender, accent, and style
- [ ] Speech rate control adjusts playback from 0.5x to 2.0x with pitch correction
- [ ] SSML parser renders emphasis, break, prosody, say-as tags correctly
- [ ] Audio playback outputs to default audio device without glitches
- [ ] Audio file writer exports to WAV, MP3, and OGG formats
- [ ] Voice cache stores and retrieves synthesized audio with configurable TTL
- [ ] Text normalizer correctly expands numbers, dates, abbreviations, and acronyms
- [ ] TTS configuration allows backend selection per user preference
- [ ] CLI `tts speak` synthesizes and plays audio file

**Risk Level**: MEDIUM — Piper TTS requires C++ compilation with platform-specific audio libraries; streaming TTS requires careful synchronization between synthesis and playback; SSML parsing must handle malformed input gracefully; cloud TTS backends have different pricing models and rate limits; voice cache storage management to prevent disk overflow; multiple backend integration requires careful error handling for API failures

---

#### Subphase 24.4: Implement Multimodal Input Handling (Images, Audio, Video, Files)
**Week**: 4
**Description**: Build a unified multimodal input handler that can process and route various input types to appropriate AI models and tools. The multimodal handler accepts: **images** (PNG, JPEG, WebP, GIF) for vision analysis via supported vision models (GPT-4V, Claude 3 Vision, Gemini Vision, local LLaVA); **audio** (WAV, MP3, OGG, FLAC) for transcription (local Whisper) or audio understanding (Gemini Audio, OpenAI GPT-4o Audio); **video** (MP4, MOV, AVI, WebM) with frame extraction for vision analysis or full video understanding; **files** (PDF, DOCX, XLSX, CSV, plain text, code) with content extraction and chunking for context window management; and **screen captures** for real-time desktop understanding. The handler implements automatic modality detection, content extraction (text from PDFs, frames from video), size optimization (image resizing, video compression), and format conversion. Each modality routes through a capability-aware dispatch: if the active model supports that modality natively, the raw content is sent; otherwise, the handler extracts a textual description (image captioning, video summarization, audio transcription) and sends that instead.

**Copy Source**: New subsystem (combining `goose_repo/crates/goose-mcp/src/computercontroller/` vision input + `gemini-cli` file handling + `gemini-cli` multimodal capabilities)

**Key Files to Create/Modify**:
- `packages/multimodal/input/src/index.ts` — Multimodal input handler entry
- `packages/multimodal/input/src/input-detector.ts` — Modality detection from file content/MIME type
- `packages/multimodal/input/src/image-handler.ts` — Image processing (resize, compress, analyze)
- `packages/multimodal/input/src/audio-handler.ts` — Audio processing (transcribe, analyze, summarize)
- `packages/multimodal/input/src/video-handler.ts` — Video processing (frame extraction, compression)
- `packages/multimodal/input/src/file-handler.ts` — File content extraction (PDF, DOCX, XLSX, CSV, code)
- `packages/multimodal/input/src/screen-capture.ts` — Screen capture integration
- `packages/multimodal/input/src/capability-router.ts` — Route to native model or fallback extraction
- `packages/multimodal/input/src/image-caption.ts` — Image captioning for non-vision models
- `packages/multimodal/input/src/video-summary.ts` — Video summarization for non-video models
- `packages/multimodal/input/src/audio-summary.ts` — Audio summarization for non-audio models
- `packages/multimodal/input/src/ocr.ts` — OCR for image text extraction (Tesseract or similar)
- `packages/multimodal/input/src/chunker.ts` — Large file chunking for context window limits
- `packages/multimodal/input/src/mime-types.ts` — MIME type detection and mapping
- `packages/multimodal/input/src/optimizer.ts` — Size/quality optimization per modality
- `packages/multimodal/input/src/types.ts` — Multimodal input type definitions
- `packages/multimodal/input/extractors/pdf.ts` — PDF content extractor (pdf.js or similar)
- `packages/multimodal/input/extractors/docx.ts` — DOCX content extractor
- `packages/multimodal/input/extractors/xlsx.ts` — XLSX content extractor
- `packages/multimodal/input/extractors/csv.ts` — CSV/TSV content extractor
- `packages/multimodal/input/extractors/code.ts` — Source code extractor (syntax-aware)
- `packages/multimodal/input/extractors/archive.ts` — Archive extractor (ZIP, TAR, RAR)
- `packages/multimodal/input/vendors/tesseract/` — Tesseract OCR C++ bindings
- `packages/multimodal/input/vendors/ffmpeg/` — FFmpeg video processing (via fluent-ffmpeg or similar)
- `apps/cli/src/commands/input.ts` — CLI commands: `agentic input image/audio/video/file <path>`
- `apps/desktop/src/hooks/useMultimodal.ts` — React hook for multimodal input in desktop app

**Acceptance Criteria**:
- [ ] Image handler processes PNG, JPEG, WebP, GIF with automatic resize to model limits
- [ ] Audio handler transcribes WAV, MP3, OGG, FLAC via local Whisper or cloud API
- [ ] Video handler extracts keyframes at configurable intervals from MP4, MOV, AVI, WebM
- [ ] File handler extracts text from PDF, DOCX, XLSX, CSV with layout preservation
- [ ] Capability router sends raw multimodal data to models that support it, extracts text otherwise
- [ ] Image captioning generates descriptive text for non-vision models
- [ ] Video summarization extracts meaningful frames and generates scene descriptions
- [ ] Audio summarization provides both transcript and summary
- [ ] OCR extracts printed text from images with configurable language support
- [ ] Chunker splits large inputs while preserving semantic boundaries (sentences, paragraphs)
- [ ] Optimizer reduces image/video size while maintaining sufficient quality for analysis
- [ ] Screen capture integration captures full screen or selected region
- [ ] CLI `input image` analyzes image with current model and returns description
- [ ] CLI `input file` extracts and analyzes file content
- [ ] All extracted content preserves metadata (page numbers, timestamps, source filename)

**Risk Level**: MEDIUM-HIGH — Video processing requires FFmpeg which is a heavy dependency; PDF extraction quality varies wildly between document types; OCR accuracy depends heavily on image quality and language; file chunking must handle multi-megabyte documents without excessive memory usage; FFmpeg Native bindings may require platform-specific compilation; capability routing must be model-aware to send correct modality data

---

#### Subphase 24.5: Implement Screen Capture and Computer Control (from Goose)
**Week**: 5
**Description**: Port Goose's computer control capabilities from the `goose-mcp/src/computercontroller/` package, which provides comprehensive desktop automation via Playwright-based browser control and native desktop automation. The computer controller includes: **screen capture** (full screen, window, or region with configurable resolution); **mouse control** (click, double-click, right-click, drag, hover, scroll) with coordinate or target-based positioning; **keyboard control** (type, hotkeys, shortcuts, key combinations); **window management** (list, focus, resize, minimize, close); **clipboard access** (read/write text, images); **file system operations** (open, save, select files via native dialogs); and **PDF/Excel/Word document automation** (read, write, format). The controller uses accessibility APIs (macOS Accessibility, Windows UI Automation, Linux AT-SPI) for target discovery (finding buttons, text fields, links by label or role) and Playwright for browser automation. This subphase integrates the computer controller into the MCP tool ecosystem and the multimodal input system, enabling agents to see and control the user's computer.

**Copy Source**: `goose_repo/crates/goose-mcp/src/computercontroller/` → `packages/computer-control/`

**Key Files to Create/Modify**:
- `packages/computer-control/src/index.ts` — Computer control entry
- `packages/computer-control/src/controller.ts` — Main controller orchestrator
- `packages/computer-control/src/screen-capture.ts` — Screen capture (full, window, region)
- `packages/computer-control/src/mouse.ts` — Mouse control (click, drag, scroll, move)
- `packages/computer-control/src/keyboard.ts` — Keyboard control (type, key combo, shortcuts)
- `packages/computer-control/src/window-manager.ts` — Window management (list, focus, resize)
- `packages/computer-control/src/clipboard.ts` — Clipboard operations (read/write text, images)
- `packages/computer-control/src/file-dialog.ts` — Native file dialog automation
- `packages/computer-control/src/accessibility.ts` — Accessibility API for target discovery
- `packages/computer-control/src/accessibility-mac.ts` — macOS Accessibility (AXAPI)
- `packages/computer-control/src/accessibility-win.ts` — Windows UI Automation
- `packages/computer-control/src/accessibility-linux.ts` — Linux AT-SPI
- `packages/computer-control/src/browser/playwright.ts` — Playwright browser automation
- `packages/computer-control/src/browser/page-ops.ts` — Page navigation, click, type, screenshot
- `packages/computer-control/src/browser/network.ts` — Network request interception
- `packages/computer-control/src/browser/console.ts` — Console message capture
- `packages/computer-control/src/document/pdf.ts` — PDF automation (via pdf-lib)
- `packages/computer-control/src/document/docx.ts` — DOCX automation (via docx library)
- `packages/computer-control/src/document/xlsx.ts` — XLSX automation (via exceljs)
- `packages/computer-control/src/types.ts` — Computer control type definitions
- `packages/computer-control/src/errors.ts` — Error types for automation failures
- `packages/computer-control/src/permissions.ts` — Permission checking for accessibility APIs
- `packages/computer-control/src/config.ts` — Computer control configuration
- `packages/computer-control/mcp/computer-control-tools.ts` — MCP tool definitions
- `packages/computer-control/mcp/computer-control-server.ts` — MCP server wrapper
- `packages/computer-control/tests/` — Test suite with recorded interactions
- `apps/cli/src/commands/computer.ts` — CLI commands: `agentic computer screenshot/mouse/type`
- `packages/config/src/schemas/computer-control.ts` — Configuration schema

**Acceptance Criteria**:
- [ ] Screen capture captures full screen, active window, and selected region at configurable resolutions
- [ ] Mouse control performs click, double-click, right-click, drag, and scroll at specified coordinates
- [ ] Keyboard control types text, performs hotkeys (Ctrl+C, Cmd+Tab), and key combinations
- [ ] Window manager lists open windows, focuses specific window, resizes and repositions
- [ ] Clipboard operations read and write both text and images
- [ ] File dialog automation opens, navigates, selects files, and saves
- [ ] Accessibility API discovers UI elements by role, label, and state on all three platforms
- [ ] Playwright browser automation navigates, clicks, types, and takes screenshots
- [ ] PDF automation creates, reads, and modifies PDF documents
- [ ] DOCX automation creates and reads Word documents with formatting
- [ ] XLSX automation creates and reads Excel spreadsheets with formulas
- [ ] Permission checking requests accessibility permissions with clear user guidance
- [ ] MCP tool definitions expose all computer control operations as callable tools
- [ ] MCP server wrapper enables remote computer control (with authentication)
- [ ] CLI `computer screenshot` captures and saves screenshot
- [ ] CLI `computer type "hello"` types text into focused application
- [ ] All operations have configurable timeouts and error recovery

**Risk Level**: HIGH — Accessibility APIs differ significantly between macOS, Windows, and Linux, requiring three distinct implementations; screen capture on macOS requires screen recording permission; Playwright browser automation requires browser-specific driver management; native desktop automation is inherently fragile (UI element positions change with window resizing, OS updates); clipboard access on Linux requires X/wayland-specific implementations; document automation libraries may have compatibility issues with complex documents; permission handling must be user-friendly (clear explanations, one-time vs always permissions)

---

## Phase 25: Sandbox & Security Isolation
**Duration**: 5 weeks
**Dependencies**: Phase 22 (MCP & Tool Ecosystem — security integration), Phase 23 (Extension & Recipe System — sandbox for extensions)
**Overall Risk**: HIGH — Security isolation is critical for system integrity; implementation must be robust against real-world attacks

### Overview
Phase 25 creates a comprehensive sandbox and security isolation subsystem by combining the WASM sandbox from **Agentic OS V3**, the sandbox system from **gemini-cli** (sandboxed file system, Docker/Podman sandbox, macOS sandbox profiles), and a unified policy engine (from gemini-cli's policy engine). The result is a defense-in-depth security architecture where every code execution path — whether from AI model output, extension code, MCP server commands, or user scripts — runs in a sandboxed environment with least-privilege permissions, resource limits, and audit logging.

---

#### Subphase 25.1: Import Agentic OS V3 WASM Sandbox
**Week**: 1
**Description**: Port Agentic OS V3's WASM sandbox system, which provides a secure runtime environment for executing untrusted code as WASM modules. The V3 WASM sandbox uses wasmtime (a fast and secure WebAssembly runtime) with a capability-based security model where each module is granted explicit permissions for filesystem access, network access, and system calls. The sandbox supports multiple WASM module types: skill plugins that extend agent capabilities, pipeline processors that transform data within workflows, and custom code execution for user-provided scripts. The runtime includes memory limits (configurable per module), CPU time limits (with pre-emptive termination), filesystem sandboxing (virtual filesystem with mapping to real paths), and network access controls (allow/deny lists for outbound connections). The sandbox manager handles module caching, pre-compilation for faster startup, module verification (checksum validation), and isolation between concurrent module executions. This subphase integrates the WASM sandbox into the unified extension system as the default runtime for WASM-based extensions.

**Copy Source**: `Agentic_OS_V3/server/src/services/sandbox/` + `Agentic_OS_V3/src/lib/os/wasm-plugin-runtime/` → `packages/sandbox/wasm/`

**Key Files to Create/Modify**:
- `packages/sandbox/wasm/src/index.ts` — WASM sandbox entry
- `packages/sandbox/wasm/src/runtime.ts` — wasmtime runtime initialization
- `packages/sandbox/wasm/src/manager.ts` — Sandbox manager (create, execute, destroy)
- `packages/sandbox/wasm/src/module-loader.ts` — WASM module loading and verification
- `packages/sandbox/wasm/src/module-cache.ts` — Pre-compiled module cache
- `packages/sandbox/wasm/src/capabilities.ts` — Capability-based permission system
- `packages/sandbox/wasm/src/filesystem.ts` — Virtual filesystem with path mapping
- `packages/sandbox/wasm/src/networking.ts` — Network access controls
- `packages/sandbox/wasm/src/memory-limits.ts` — Memory allocation limits
- `packages/sandbox/wasm/src/cpu-limits.ts` — CPU time limits and pre-emption
- `packages/sandbox/wasm/src/instance-pool.ts` — Instance pool for concurrent execution
- `packages/sandbox/wasm/src/abi.ts` — WASM-to-host ABI protocol
- `packages/sandbox/wasm/src/plugins/index.ts` — Plugin system for sandbox extensions
- `packages/sandbox/wasm/src/plugins/logging.ts` — Logging plugin for module activity
- `packages/sandbox/wasm/src/plugins/metrics.ts` — Metrics collection plugin
- `packages/sandbox/wasm/src/types.ts` — Sandbox type definitions
- `packages/sandbox/wasm/src/errors.ts` — Sandbox-specific error types
- `packages/sandbox/wasm/src/config.ts` — Sandbox configuration
- `packages/sandbox/wasm/tests/` — Test suite with malicious WASM modules
- `packages/sandbox/wasm/tests/modules/escape-attempt.wasm` — Malicious module for security testing
- `packages/sandbox/wasm/tests/modules/valid-module.wasm` — Valid module for functional testing
- `packages/extensions/wasm/src/sandbox-integration.ts` — Integration with extension system

**Acceptance Criteria**:
- [ ] WASM module loads, initializes, and executes with host-provided capabilities
- [ ] Memory limits prevent module from allocating more than configured limit
- [ ] CPU time limits terminate modules that exceed configured time budget
- [ ] Virtual filesystem restricts module access to explicitly mapped paths
- [ ] Network controls block all outbound connections unless explicitly allowed
- [ ] Module verification rejects modules with invalid checksums
- [ ] Instance pool handles concurrent module execution with proper isolation
- [ ] ABI protocol enables host-to-module and module-to-host communication
- [ ] Malicious module escape attempts are blocked at the WASM boundary
- [ ] Module cache improves cold-start time by >10x for cached modules
- [ ] Logging plugin records all module activity (function calls, memory access, filesystem ops)
- [ ] Metrics plugin collects execution time, memory usage, and capability utilization
- [ ] Extension system correctly delegates WASM extension execution to sandbox
- [ ] Sandbox configuration allows per-module capability customization
- [ ] All error conditions produce structured error information for debugging

**Risk Level**: HIGH — WASM sandbox security is only as strong as the wasmtime runtime; capability system must be non-bypassable by design; virtual filesystem implementation must handle all POSIX operations correctly; concurrent instance isolation requires careful state management; escape attempts from adversarial modules are a constant threat; wasmtime version updates may introduce breaking ABI changes

---

#### Subphase 25.2: Import gemini-cli Sandbox System (sandboxedFileSystemService, sandboxManager)
**Week**: 2
**Description**: Port gemini-cli's sandbox system, which provides a comprehensive file-level and process-level sandboxing framework. The `sandboxedFileSystemService` creates a virtualized filesystem view for sandboxed processes, with controlled access to the real filesystem through configurable read/write mappings, temporary directories for ephemeral storage, and quarantine zones for suspicious files. The `sandboxManager` orchestrates sandbox lifecycle: creation, configuration, execution, monitoring, and teardown. The sandbox supports multiple isolation levels: **none** (no sandbox — for trusted operations), **filesystem-only** (sandboxed file access, unrestricted networking), **full** (sandboxed filesystem + restricted networking + process isolation), and **container** (full container-level isolation via Docker/Podman). The system also includes a **quarantine service** that isolates files downloaded or created by untrusted operations, scanning them for malware before allowing access. This subphase merges gemini-cli's flexible sandbox tiers with the Agentic OS V3 WASM sandbox to create a unified sandbox hierarchy: WASM-level → Process-level → Container-level isolation.

**Copy Source**: `gemini-cli/packages/core/src/sandbox/` → `packages/sandbox/filesystem/` and `packages/sandbox/manager/`

**Key Files to Create/Modify**:
- `packages/sandbox/filesystem/src/index.ts` — Sandboxed filesystem entry
- `packages/sandbox/filesystem/src/sandboxed-file-system.ts` — Virtual filesystem service (from sandboxedFileSystemService)
- `packages/sandbox/filesystem/src/path-mapper.ts` — Real-to-virtual path mapping
- `packages/sandbox/filesystem/src/access-control.ts` — Read/write/execute permission evaluation
- `packages/sandbox/filesystem/src/temp-directory.ts` — Ephemeral temp directory management
- `packages/sandbox/filesystem/src/quarantine.ts` — File quarantine service
- `packages/sandbox/filesystem/src/quarantine-scanner.ts` — Malware scanning integration (ClamAV or similar)
- `packages/sandbox/filesystem/src/file-type-detect.ts` — File type detection for security policies
- `packages/sandbox/filesystem/src/types.ts` — Filesystem sandbox types
- `packages/sandbox/manager/src/index.ts` — Sandbox manager entry
- `packages/sandbox/manager/src/sandbox-manager.ts` — Sandbox lifecycle orchestrator (from sandboxManager)
- `packages/sandbox/manager/src/isolation-levels.ts` — Isolation level definitions (none/filesystem/full/container)
- `packages/sandbox/manager/src/sandbox-config.ts` — Per-sandbox configuration
- `packages/sandbox/manager/src/sandbox-executor.ts` — Command execution within sandbox
- `packages/sandbox/manager/src/resource-monitor.ts` — CPU/memory/disk monitoring for sandboxed processes
- `packages/sandbox/manager/src/process-isolation.ts` — Process-level isolation (pid namespaces, cgroups)
- `packages/sandbox/manager/src/network-isolation.ts` — Network isolation (iptables, pf, Windows Filtering Platform)
- `packages/sandbox/manager/src/types.ts` — Sandbox manager types
- `packages/sandbox/unified/src/index.ts` — Unified sandbox abstraction
- `packages/sandbox/unified/src/sandbox-orchestrator.ts` — Selects sandbox type based on requirements
- `packages/sandbox/unified/src/sandbox-chain.ts` — Layered sandbox execution (WASM → Process → Container)
- `packages/sandbox/unified/src/types.ts` — Unified sandbox types
- `packages/config/src/schemas/sandbox.ts` — Sandbox configuration schema
- `apps/cli/src/commands/sandbox.ts` — CLI commands: `agentic sandbox run/file/status`

**Acceptance Criteria**:
- [ ] Sandboxed filesystem restricts read/write to configured allowed paths
- [ ] Path mapping correctly translates between virtual and real paths
- [ ] Temp directory creates isolated ephemeral storage per sandbox instance
- [ ] Quarantine service isolates untrusted files with configurable retention policy
- [ ] Malware scanning integration (ClamAV) scans quarantined files
- [ ] Sandbox manager creates, configures, executes, and destroys sandbox instances
- [ ] All four isolation levels (none, filesystem, full, container) work correctly
- [ ] Resource monitor tracks CPU, memory, and disk usage for sandboxed processes
- [ ] Process isolation prevents sandboxed processes from accessing host processes
- [ ] Network isolation blocks unauthorized outbound connections per policy
- [ ] Unified sandbox orchestrator selects appropriate sandbox type per operation
- [ ] Sandbox chaining applies WASM sandbox within process sandbox within container sandbox
- [ ] CLI `sandbox run <command>` executes command with default isolation level
- [ ] CLI `sandbox status` shows active sandbox instances with resource usage
- [ ] All sandbox tiers gracefully handle resource exhaustion

**Risk Level**: HIGH — Process isolation requires OS-level capabilities (Linux namespaces/cgroups, macOS sandbox, Windows Job Objects/AppContainer); network isolation requires platform-specific firewall configuration; quarantine service must balance thorough scanning with user experience; container-level isolation requires Docker/Podman to be installed; filesystem sandbox on Windows has different semantics than Unix; malware scanning integration may raise false positives; resource monitoring overhead must be minimal (<2% CPU)

---

#### Subphase 25.3: Implement Docker/Podman Sandbox (from gemini-cli)
**Week**: 3
**Description**: Port gemini-cli's Docker/Podman container sandbox system, which provides the highest level of isolation by running untrusted code in a full container environment. The container sandbox creates ephemeral Docker or Podman containers with configured resource limits (CPU, memory, disk), filesystem mounts (read-only for most paths, read-write for specific working directories), network policies (isolated, bridged, or host networking), and security constraints (read-only root filesystem, dropped Linux capabilities, seccomp profiles, AppArmor/SELinux profiles). The sandbox supports both **Docker** and **Podman** as container runtimes, with automatic detection of the available runtime. Containers are built from minimal base images (e.g., alpine:latest, distroless) with only required dependencies installed. The container lifecycle is fully managed: image pull (with caching), container create, file copy in/out, command execution with streaming output, health monitoring, and container cleanup (forced removal after timeout). The sandbox image is configurable, allowing organizations to use custom hardened images with their specific tooling.

**Copy Source**: `gemini-cli/scripts/build_sandbox.js` + `gemini-cli/packages/core/src/sandbox/container/` → `packages/sandbox/container/`

**Key Files to Create/Modify**:
- `packages/sandbox/container/src/index.ts` — Container sandbox entry
- `packages/sandbox/container/src/docker-client.ts` — Docker Engine API client
- `packages/sandbox/container/src/podman-client.ts` — Podman API client (compatible with Docker API)
- `packages/sandbox/container/src/runtime-detector.ts` — Auto-detect available container runtime
- `packages/sandbox/container/src/container-manager.ts` — Container lifecycle management
- `packages/sandbox/container/src/image-manager.ts` — Image pull, cache, and verification
- `packages/sandbox/container/src/image-builder.ts` — Custom image building (from Dockerfile)
- `packages/sandbox/container/src/resource-limits.ts` — CPU/memory/disk limits via Docker API
- `packages/sandbox/container/src/filesystem-mounts.ts` — Read-only and read-write volume mounts
- `packages/sandbox/container/src/network-policy.ts` — Network isolation modes (isolated, bridge, host)
- `packages/sandbox/container/src/security-policy.ts` — Security constraints (capabilities, seccomp, AppArmor)
- `packages/sandbox/container/src/executor.ts` — Command execution in container with streaming
- `packages/sandbox/container/src/file-copy.ts` — File copy in/out of container
- `packages/sandbox/container/src/health-check.ts` — Container health monitoring
- `packages/sandbox/container/src/cleanup.ts` — Container cleanup with timeout enforcement
- `packages/sandbox/container/src/types.ts` — Container sandbox types
- `packages/sandbox/container/src/errors.ts` — Container-specific error types
- `packages/sandbox/container/config/` — Configuration files
- `packages/sandbox/container/config/default-image.json` — Default sandbox image configuration
- `packages/sandbox/container/images/` — Dockerfile templates for sandbox images
- `packages/sandbox/container/images/alpine.Dockerfile` — Minimal Alpine sandbox image
- `packages/sandbox/container/images/distroless.Dockerfile` — Google distroless sandbox image
- `packages/sandbox/container/images/node.Dockerfile` — Node.js sandbox image for script execution
- `packages/sandbox/container/images/python.Dockerfile` — Python sandbox image
- `packages/sandbox/container/scripts/build-sandbox-images.sh` — Script to build sandbox images
- `packages/sandbox/unified/src/container-integration.ts` — Integration with unified sandbox
- `packages/sandbox/manager/src/container-executor.ts` — Sandbox manager container execution

**Acceptance Criteria**:
- [ ] Container runtime auto-detects Docker and Podman with correct API version
- [ ] Container manager creates, starts, monitors, and destroys containers
- [ ] Image manager pulls images from registries with SHA256 verification
- [ ] Custom image building from Dockerfile with caching
- [ ] Resource limits (CPU, memory, disk) are enforced at container level
- [ ] Filesystem mounts: system paths read-only, working directory read-write
- [ ] Network isolation: isolated mode blocks all networking, bridge allows DNS+HTTP to allowed hosts
- [ ] Security constraints: read-only root, dropped capabilities, seccomp profile applied
- [ ] Command execution streams stdout/stderr in real-time
- [ ] File copy in/out works for individual files and directories
- [ ] Health check detects container crashes and resource exhaustion
- [ ] Cleanup enforces configurable timeout (default 30 minutes) with force removal
- [ ] Default sandbox images (Alpine, distroless, Node.js, Python) build and run
- [ ] Container executor integrates with sandbox manager for container-level isolation
- [ ] Unified sandbox uses container isolation for highest-risk operations
- [ ] Error handling for Docker daemon not running or insufficient permissions

**Risk Level**: MEDIUM — Docker/Podman require daemon installation and user in docker group; Docker API versions differ between Docker and Podman; container cleanup must handle edge cases (daemon restart, orphaned containers); image building requires network access; resource limits on macOS Docker Desktop work differently than Linux; Windows container support is limited (requires Windows containers mode); Docker socket access is a security concern (must not give agent full Docker access)

---

#### Subphase 25.4: Implement macOS Sandbox Profiles (from gemini-cli)
**Week**: 4
**Description**: Port gemini-cli's macOS sandbox profile system, which provides native macOS-level sandboxing using Apple's Sandbox Kernel Extension (Sandbox.kext). macOS sandbox profiles are compiled `.sb` files that define fine-grained restrictions on system resources: filesystem access (read/write/execute per path), networking (inbound/outbound per host/port), IPC (Mach ports, XPC services), hardware (camera, microphone, USB), and system calls (allowed/disallowed syscalls). The system includes a library of pre-built sandbox profiles for common use cases: **default-deny** (block everything, whitelist needed resources), **networking-only** (allow networking, block filesystem), **filesystem-read** (read-only filesystem, block networking), **development** (allow compilation, debugging tools), and **custom** (user-defined profile). Profiles are compiled using Apple's `sandbox-compiler` tool and applied via `sandbox-exec` or the Sandbox.framework API. The subsystem also includes profile generation from capability manifests, allowing extensions and MCP servers to declare their required resources and have a sandbox profile auto-generated. This subphase ensures macOS users get the strongest native sandboxing available on Apple platforms.

**Copy Source**: `gemini-cli/packages/core/src/sandbox/macos/` → `packages/sandbox/macos/`

**Key Files to Create/Modify**:
- `packages/sandbox/macos/src/index.ts` — macOS sandbox entry
- `packages/sandbox/macos/src/profile-compiler.ts` — Sandbox profile compilation (.sb text → compiled .sb)
- `packages/sandbox/macos/src/profile-applier.ts` — Sandbox profile application via sandbox-exec
- `packages/sandbox/macos/src/profile-library.ts` — Pre-built sandbox profile library
- `packages/sandbox/macos/src/profiles/default-deny.sb` — Default deny-all profile
- `packages/sandbox/macos/src/profiles/networking-only.sb` — Networking-only profile
- `packages/sandbox/macos/src/profiles/filesystem-read.sb` — Read-only filesystem profile
- `packages/sandbox/macos/src/profiles/development.sb` — Development tools profile
- `packages/sandbox/macos/src/profiles/empty.sb` — Empty profile (no restrictions, for testing)
- `packages/sandbox/macos/src/generator.ts` — Auto-generate profile from capability manifest
- `packages/sandbox/macos/src/capability-mapper.ts` — Map capability declarations to sandbox primitives
- `packages/sandbox/macos/src/validator.ts` — Profile syntax and security validation
- `packages/sandbox/macos/src/audit.ts` — Sandbox violation audit log monitoring
- `packages/sandbox/macos/src/entitlements.ts` — macOS entitlement management (hardened runtime)
- `packages/sandbox/macos/src/system-extension.ts` — System Extension management for network filters
- `packages/sandbox/macos/src/types.ts` — macOS sandbox type definitions
- `packages/sandbox/macos/tests/` — Test suite for macOS sandbox profiles
- `packages/sandbox/macos/tests/profiles/` — Test profiles for validation
- `packages/sandbox/unified/src/macos-integration.ts` — Integration with unified sandbox
- `packages/sandbox/manager/src/macos-executor.ts` — Sandbox manager macOS execution

**Acceptance Criteria**:
- [ ] Profile compiler compiles .sb text files to binary sandbox profiles
- [ ] Profile applier executes commands within sandbox profile (sandbox-exec)
- [ ] Pre-built profiles (default-deny, networking-only, filesystem-read) apply correct restrictions
- [ ] Default-deny profile blocks filesystem writes, networking, IPC, and hardware access
- [ ] Networking-only profile allows all networking, blocks filesystem writes
- [ ] Filesystem-read profile allows read access to configured paths, blocks writes
- [ ] Auto-generator creates valid sandbox profile from capability manifest
- [ ] Capability mapper correctly translates "network: true" to networking allow rules
- [ ] Profile validator detects invalid syntax and security-relevant misconfigurations
- [ ] Audit monitoring captures sandbox violations with process ID and offending operation
- [ ] Entitlement management ensures hardened runtime with proper entitlements
- [ ] System Extension support for network content filter policies
- [ ] Sandbox violation raises structured error for user visibility
- [ ] Unified sandbox detects macOS and uses native sandbox profiles when available
- [ ] Sandbox manager macOS executor applies profile to command execution
- [ ] All profiles handle file paths with spaces and special characters

**Risk Level**: MEDIUM — macOS sandbox profiles have subtle semantics (file read/write/execute rules interact in non-obvious ways); sandbox-exec requires command-line tool availability; profile compilation requires Xcode command-line tools; Apple may change sandbox API in future macOS versions; System Extensions require user approval and are not suitable for all use cases; audit monitoring requires reading sandbox violation logs from the system log; profiles must be tested on multiple macOS versions (Ventura, Sonoma, Sequoia)

---

#### Subphase 25.5: Implement Policy Engine (from gemini-cli policy engine)
**Week**: 5
**Description**: Port gemini-cli's policy engine, which provides a centralized policy evaluation system for making security decisions across the entire Agentic OS V4 platform. The policy engine uses a declarative policy language (YAML-based) to define rules that govern: **tool execution** (which tools can be called, with what arguments, on what data), **model access** (which models can be used for which tasks), **data access** (which files/APIs/databases can be read/written), **network access** (which hosts/ports/protocols can be accessed), **extension installation** (which extensions can be installed from which sources), **user permissions** (what each user/role can do), and **audit requirements** (what must be logged and retained). Policies are evaluated against a context that includes the requesting user, the target resource, the operation being performed, and environmental factors (time of day, network location, device security posture). The policy engine supports multiple evaluation modes: **enforce** (block violations), **audit** (log violations but allow), **warn** (warn user but allow), and **simulate** (evaluate without action for testing). Policies can be loaded from local files, remote URLs, or embedded defaults, and support hot-reload for policy updates without restarting the agent.

**Copy Source**: `gemini-cli/packages/core/src/policy/` → `packages/sandbox/policy-engine/`

**Key Files to Create/Modify**:
- `packages/sandbox/policy-engine/src/index.ts` — Policy engine entry
- `packages/sandbox/policy-engine/src/engine.ts` — Core policy evaluation engine
- `packages/sandbox/policy-engine/src/parser.ts` — YAML policy file parser
- `packages/sandbox/policy-engine/src/validator.ts` — Policy definition validation
- `packages/sandbox/policy-engine/src/evaluator.ts` — Policy evaluation against context
- `packages/sandbox/policy-engine/src/context-builder.ts` — Build evaluation context from request
- `packages/sandbox/policy-engine/src/modes.ts` — Evaluation modes (enforce, audit, warn, simulate)
- `packages/sandbox/policy-engine/src/loader.ts` — Policy loader (local, remote, embedded)
- `packages/sandbox/policy-engine/src/hot-reload.ts` — Hot-reload policy watcher
- `packages/sandbox/policy-engine/src/cache.ts` — Policy evaluation cache
- `packages/sandbox/policy-engine/src/audit-log.ts` — Policy audit log
- `packages/sandbox/policy-engine/src/aggregator.ts` — Multi-policy aggregation (all must pass, any must pass)
- `packages/sandbox/policy-engine/src/override.ts` — Policy override with justification
- `packages/sandbox/policy-engine/src/types.ts` — Policy definition types
- `packages/sandbox/policy-engine/src/errors.ts` — Policy evaluation error types
- `packages/sandbox/policy-engine/policies/builtins/` — Built-in policy files
- `packages/sandbox/policy-engine/policies/builtins/tool-execution.yaml` — Tool execution policy
- `packages/sandbox/policy-engine/policies/builtins/model-access.yaml` — Model access policy
- `packages/sandbox/policy-engine/policies/builtins/data-access.yaml` — Data access policy
- `packages/sandbox/policy-engine/policies/builtins/network-access.yaml` — Network access policy
- `packages/sandbox/policy-engine/policies/builtins/extension-install.yaml` — Extension installation policy
- `packages/sandbox/policy-engine/policies/examples/` — Example policies for reference
- `packages/sandbox/policy-engine/policies/examples/strict.yaml` — Strict security policy
- `packages/sandbox/policy-engine/policies/examples/permissive.yaml` — Permissive policy
- `packages/sandbox/policy-engine/policies/examples/sandboxed.yaml` — Sandbox-required policy
- `packages/sandbox/policy-engine/schema/policy.schema.json` — Policy file JSON Schema
- `packages/sandbox/policy-engine/schema/policy-config.schema.json` — Policy engine config schema
- `packages/sandbox/unified/src/policy-integration.ts` — Integration with unified sandbox
- `packages/mcp/security/src/policy-hook.ts` — MCP security policy hook
- `apps/cli/src/commands/policy.ts` — CLI commands: `agentic policy list/evaluate/test/reload`
- `packages/config/src/schemas/policy.ts` — Policy engine configuration schema

**Acceptance Criteria**:
- [ ] Policy parser loads and validates YAML policy definitions with detailed error reporting
- [ ] Policy evaluator correctly evaluates allow/deny decisions against context
- [ ] Context builder gathers user, resource, operation, and environmental factors
- [ ] All four evaluation modes (enforce, audit, warn, simulate) work correctly
- [ ] Policy loader resolves policies from local files and remote URLs
- [ ] Hot-reload detects policy file changes and reloads without service restart
- [ ] Evaluation cache improves performance for repeated evaluations (same context + policy)
- [ ] Audit log records all policy evaluations with outcome and context
- [ ] Policy aggregator supports AND (all policies must pass) and OR (any policy passes)
- [ ] Policy override allows authorized users to bypass policies with audit trail
- [ ] Built-in policies cover tool execution, model access, data access, network access, and extensions
- [ ] Example policies (strict, permissive, sandboxed) serve as documentation templates
- [ ] JSON Schema validates policy files with intellisense support in editors
- [ ] Policy integration hooks into unified sandbox, MCP security, and extension systems
- [ ] CLI `policy list` shows loaded policies with source and evaluation mode
- [ ] CLI `policy evaluate <action>` tests a policy decision without enforcement
- [ ] CLI `policy reload` triggers hot-reload of all policies
- [ ] Policy evaluation completes in <5ms for typical policies
- [ ] Built-in default policy ensures secure operation out of the box (no unsafe defaults)

**Risk Level**: MEDIUM-HIGH — Policy language design must be expressive enough for complex rules but simple enough for users to write correctly; policy evaluation must be deterministic and consistent; policy overriding requires proper authentication and audit; hot-reload must handle invalid policy files gracefully (revert to last valid policy); multi-policy aggregation with conflicting rules requires clear precedence semantics; policy audit log must be tamper-evident (append-only or signed); context gathering for environmental factors (device security posture) requires platform-specific implementations

---

#### Subphase 21.6: Implement ONNX Runtime Backend (NEW — Gap Fill from R5)
**Week**: 7
**Description**: Add ONNX Runtime as a fourth local inference backend to support the industry-standard ONNX (Open Neural Network Exchange) model format. ONNX provides maximum model portability, allowing models trained in PyTorch, TensorFlow, JAX, or any framework to be exported to a common format and executed via ONNX Runtime with hardware acceleration across CPU, CUDA, ROCm, DirectML, CoreML, and OpenVINO. This backend enables users to run models from HuggingFace's Optimum library, ONNX Model Zoo, and custom-exported models. The ONNX Runtime integration uses the `onnxruntime-node` or `onnxruntime-rs` bindings for cross-platform execution, with support for both ORT (standard) and ORT Mobile (edge) configurations. The backend includes model format auto-detection (via magic bytes/file headers) that identifies GGUF, SafeTensors, TFLite, MLX, and ONNX formats without user specification, routing each to the correct inference backend.

**Key Files to Create/Modify**:
- `packages/local-inference/backends/onnx/package.json` — ONNX backend package config
- `packages/local-inference/backends/onnx/src/index.ts` — Main entry and initialization
- `packages/local-inference/backends/onnx/src/onnx-client.ts` — ONNX Runtime client
- `packages/local-inference/backends/onnx/src/model-loader.ts` — ONNX model loading (.onnx format)
- `packages/local-inference/backends/onnx/src/inference.ts` — Inference execution with streaming
- `packages/local-inference/backends/onnx/src/backends/cpu.ts` — CPU execution provider
- `packages/local-inference/backends/onnx/src/backends/cuda.ts` — CUDA execution provider
- `packages/local-inference/backends/onnx/src/backends/rocm.ts` — AMD ROCm execution provider
- `packages/local-inference/backends/onnx/src/backends/directml.ts` — DirectML (Windows) provider
- `packages/local-inference/backends/onnx/src/backends/coreml.ts` — CoreML (macOS) provider
- `packages/local-inference/backends/onnx/src/backends/openvino.ts` — Intel OpenVINO provider
- `packages/local-inference/backends/onnx/src/quantization.ts` — ONNX quantization (dynamic/static/QDQ)
- `packages/local-inference/backends/onnx/src/optimization.ts` — Graph optimization and level selection
- `packages/local-inference/abstractions/formats/auto-detect.ts` — Magic-byte format detection
- `packages/local-inference/abstractions/formats/gguf.ts` — GGUF header parser
- `packages/local-inference/abstractions/formats/safetensors.ts` — SafeTensors header parser
- `packages/local-inference/abstractions/formats/tflite.ts` — TFLite header parser
- `packages/local-inference/abstractions/formats/mlx.ts` — MLX format parser
- `packages/local-inference/abstractions/formats/onnx.ts` — ONNX proto header parser
- `packages/local-inference/abstractions/formats/types.ts` — Format type definitions

**Acceptance Criteria**:
- [ ] ONNX Runtime loads and runs ONNX models on CPU across all platforms
- [ ] CUDA execution provider accelerates inference on NVIDIA GPUs
- [ ] ROCm execution provider accelerates inference on AMD GPUs
- [ ] DirectML execution provider accelerates inference on Windows DirectX 12 GPUs
- [ ] CoreML execution provider accelerates inference on Apple Silicon
- [ ] OpenVINO execution provider accelerates inference on Intel hardware
- [ ] Format auto-detection correctly identifies GGUF, SafeTensors, TFLite, MLX, and ONNX from file headers
- [ ] Auto-detected models are routed to the correct inference backend without user configuration
- [ ] ONNX streaming inference produces >15 tok/s on modern CPU for quantized 7B models
- [ ] Quantization (dynamic/static) produces valid quantized ONNX models
- [ ] Graph optimization reduces inference latency by >20% at O3 level
- [ ] CLI `agentic local run --format auto <path>` auto-detects and runs any supported model format

**Risk Level**: MEDIUM — ONNX Runtime providing package sizes are large (100MB+ with all providers); execution provider availability varies by platform (ROCm requires AMD GPU, CoreML requires macOS); format auto-detection must handle edge cases (corrupted files, ambiguous headers); ONNX quantization requires calibration data; ONNX opset version differences across tools

---

#### Subphase 21.4.5: Implement Local Inference API Server (OpenAI-compatible) (NEW — Gap Fill from R5)
**Week**: 4 (parallel with hybrid router)
**Description**: Implement a local API server that exposes the unified local inference subsystem through an OpenAI-compatible REST API, enabling any tool or IDE that supports OpenAI's API format (VS Code extensions, Cursor, JetBrains AI, continue.dev, aider, etc.) to use local inference without modification. The server exposes `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, and `/v1/models` endpoints matching OpenAI's API schema, with streaming support via SSE. The server routes requests through the hybrid router, automatically choosing the optimal local backend or cloud provider based on configured policy. This enables a zero-configuration local AI experience: tools configured to use `http://localhost:11434/v1` (Ollama-compatible) or the standard OpenAI endpoint will seamlessly work with Agentic OS V4's local inference.

**Key Files to Create/Modify**:
- `packages/local-inference/api-server/src/index.ts` — API server entry
- `packages/local-inference/api-server/src/server.ts` — Express/Fastify HTTP server
- `packages/local-inference/api-server/src/routes/chat.ts` — `/v1/chat/completions` handler with streaming
- `packages/local-inference/api-server/src/routes/completions.ts` — `/v1/completions` handler
- `packages/local-inference/api-server/src/routes/embeddings.ts` — `/v1/embeddings` handler
- `packages/local-inference/api-server/src/routes/models.ts` — `/v1/models` listing handler
- `packages/local-inference/api-server/src/middleware/auth.ts` — Optional API key authentication
- `packages/local-inference/api-server/src/middleware/rate-limit.ts` — Rate limiting middleware
- `packages/local-inference/api-server/src/middleware/cors.ts` — CORS configuration
- `packages/local-inference/api-server/src/streaming.ts` — SSE streaming response formatting
- `packages/local-inference/api-server/src/types.ts` — API type definitions
- `apps/cli/src/commands/local-server.ts` — CLI command: `agentic local serve`

**Acceptance Criteria**:
- [ ] Server starts on configurable port (default 11434) and binds to configurable host
- [ ] `/v1/chat/completions` accepts standard OpenAI chat format and returns compatible response
- [ ] Streaming SSE responses match OpenAI streaming format for tools like continue.dev
- [ ] `/v1/embeddings` returns embeddings from the available local embedding model
- [ ] `/v1/models` lists all available local models with metadata
- [ ] Models can be loaded on-demand (lazy loading) to avoid startup delay
- [ ] Configuration auto-detects if another local server is running on the default port
- [ ] CLI `agentic local serve --openai-compat` starts the server with OpenAI compatibility
- [ ] Tools like Cursor, continue.dev, and aider can connect without additional configuration
- [ ] Server gracefully shuts down active requests on SIGTERM/SIGINT

**Risk Level**: LOW — OpenAI API format is well-documented and widely implemented; streaming SSE is a standard pattern; Express/Fastify HTTP servers are mature; API key auth is optional

---

## Cross-Phase Dependencies

```
Phase 21 (Local Inference) ──────────────────────────────┐
    ├── 21.1 ← Phase 6 (Local Inference foundation)     │
    ├── 21.2 ← Phase 6 (Local Inference foundation)     ├──→ Phase 26 (Performance Optimization)
    ├── 21.3 ← 21.1, 21.2                               │
    ├── 21.4 ← 21.3, Phase 20 (Gateway completion)      │
    └── 21.5 ← 21.3                                     │
                                                        │
Phase 22 (MCP Ecosystem) ────────────────────────────────┤
    ├── 22.1 ← Phase 3 (ACP Server)                     │
    ├── 22.2 ← 22.1                                     │
    ├── 22.3 ← 22.2                                     ├──→ Phase 27 (Platform & Distribution)
    ├── 22.4 ← 22.1, 22.2                               │
    └── 22.5 ← 22.4, Phase 25 (Sandbox)                 │
                                                        │
Phase 23 (Extension & Recipe) ───────────────────────────┤
    ├── 23.1 ← Phase 4 (Recipe & Skill)                 │
    ├── 23.2 ← Phase 4 (Recipe & Skill)                 ├──→ Phase 28 (Marketplace & Community)
    ├── 23.3 ← Phase 4 (Recipe & Skill)                 │
    ├── 23.4 ← 23.1, 23.2, 23.3                         │
    └── 23.5 ← 23.4                                     │
                                                        │
Phase 24 (Voice & Multimodal) ───────────────────────────┤
    ├── 24.1 ← Phase 21 (Local Inference)               │
    ├── 24.2 ← 24.1                                     ├──→ Phase 29 (Testing & Quality)
    ├── 24.3 ← 24.2                                     │
    ├── 24.4 ← 24.1, 24.2, Phase 25 (Sandbox)          │
    └── 24.5 ← Phase 22 (MCP Ecosystem)                 │
                                                        │
Phase 25 (Sandbox & Security) ───────────────────────────┤
    ├── 25.1 ← AGENTIC_OS_V3 (WASM sandbox)             │
    ├── 25.2 ← gemini-cli (sandbox system)              ├──→ Phase 30 (Release & Documentation)
    ├── 25.3 ← 25.2 (container runtime req)             │
    ├── 25.4 ← 25.2 (macOS-specific)                    │
    └── 25.5 ← 25.1, 25.2, 25.3, 25.4                  │
                                                        │
Phase 21 ──→ Phase 22 ──→ Phase 23 ──→ Phase 24 ──→ Phase 25
    (Local      (MCP       (Extension   (Voice &     (Sandbox &
     Inference)  Ecosystem)  & Recipe)    Multimodal)  Security)
```

---

## Risk Register — Phases 21–25

| ID | Risk Description | Probability | Impact | Phase | Mitigation Strategy |
|----|-----------------|-------------|--------|-------|---------------------|
| R21.1 | llama.cpp compilation fails on uncommon platforms | Medium | High | 21.1 | CI matrix covering 3 OS × 4 GPU backends; pre-built binaries via GitHub Actions |
| R21.2 | MLX Python bridge introduces deployment complexity | High | Medium | 21.2 | Containerize MLX bridge; provide fallback to llama.cpp on non-macOS |
| R21.3 | HuggingFace Hub API rate limits block model downloads | Low | Medium | 21.3 | Implement download queue with rate limiting; support mirror registries |
| R21.4 | Hybrid routing decision adds >50ms latency overhead | Medium | High | 21.4 | Pre-compute routing decisions; cache results; use async monitoring |
| R21.5 | Quantization format incompatibility between converters | Medium | High | 21.5 | Comprehensive test suite for round-trip conversion; format-specific validation |
| R22.1 | MCP specification changes during implementation | Medium | High | 22.1 | Version-pin to MCP 2025-03-26; abstract protocol layer for future changes |
| R22.2 | Concurrent MCP tool execution causes data races | Low | High | 22.2 | Isolated execution contexts per tool call; mutex around stateful resources |
| R22.3 | OAuth token storage fails on headless Linux (no keychain) | High | Medium | 22.3 | Fallback to encrypted file storage with master password; document limitations |
| R22.4 | Registry API rate limits from npm/GitHub | Medium | Low | 22.4 | Aggressive caching with configurable refresh intervals; offline fallback |
| R22.5 | Sandbox bypass through MCP tool composition | Low | Critical | 22.5 | Defense-in-depth: policy engine + OS sandbox + WASM sandbox layered |
| R23.1 | WASM extension ABI breaks backward compatibility | Medium | High | 23.1 | Semantic versioning for ABI; migration guide for extension authors |
| R23.2 | YAML recipe parser vulnerabilities | Low | High | 23.2 | Use safe YAML parser (no code execution); schema validation before parsing |
| R23.3 | Hook execution order conflicts between plugins | Medium | Medium | 23.3 | Hook planner with explicit priority and dependency declarations |
| R23.4 | Marketplace format does not satisfy all extension types | Medium | Medium | 23.4 | Design review with extension authors from all three ecosystems |
| R23.5 | Dependency resolution SAT solver timeout on complex graphs | Low | Medium | 23.5 | Timeout with fallback to simple resolution; user-configurable depth limit |
| R24.1 | Whisper.cpp compilation complexity | High | High | 24.1 | Pre-built binaries with napi-rs; comprehensive build documentation |
| R24.2 | Audio capture API differences across platforms | High | Medium | 24.2 | Implement platform-specific modules behind unified interface; graceful degradation |
| R24.3 | TTS latency unacceptable for interactive use | Medium | High | 24.3 | Streaming TTS with chunked synthesis; pre-fetch common responses |
| R24.4 | Video processing with FFmpeg is resource-intensive | Medium | Medium | 24.4 | Configurable frame extraction rate; server-side processing option |
| R24.5 | Desktop automation fragile to OS version changes | High | High | 24.5 | Extensive regression testing; feature flags with fallback to manual steps |
| R25.1 | WASM runtime security vulnerability | Low | Critical | 25.1 | Keep wasmtime updated; monitor security advisories; defense-in-depth |
| R25.2 | Filesystem sandbox escape via `/proc` or `/sys` | Low | Critical | 25.2 | Block all non-essential filesystem paths; regular security audits |
| R25.3 | Docker socket privilege escalation risk | Medium | Critical | 25.3 | Never mount Docker socket; use Docker API with restricted permissions |
| R25.4 | macOS sandbox profile bypass | Low | Critical | 25.4 | Combine with container sandbox for defense-in-depth; audit all profiles |
| R25.5 | Policy language too complex for users | Medium | Medium | 25.5 | Provide policy templates; CLI wizard for policy creation; documentation |

---

## Success Criteria — Phases 21–25

### Phase 21 — Local & Edge Inference
- [ ] All three inference backends (llama.cpp, LiteRT, MLX) compile and run on their target platforms
- [ ] Model download manager downloads, verifies, and manages 50+ models
- [ ] Hybrid router correctly selects local vs cloud with <10% suboptimal decisions
- [ ] Quantization management supports GGUF, AWQ, and GPTQ formats end-to-end
- [ ] User can run a local model with `agentic local run --model llama3.2:7b` and get streaming output
- [ ] Automatic GPU detection selects optimal backend without user configuration

### Phase 22 — MCP & Tool Ecosystem
- [ ] Unified MCP client connects to stdio, HTTP, WebSocket, and SSE servers
- [ ] MCP OAuth authenticates with GitHub, Google, Slack, and Microsoft providers
- [ ] MCP registry discovers 200+ servers from official, npm, and GitHub sources
- [ ] MCP tool sandboxing prevents malicious servers from accessing unauthorized resources
- [ ] User can install and use an MCP server with `agentic mcp install @modelcontextprotocol/server-github`

### Phase 23 — Extension & Recipe System
- [ ] WASM extensions load, execute, and expose tools/resources via the unified ABI
- [ ] YAML recipes from existing Goose installations run without modification
- [ ] Hooks system intercepts all agent lifecycle events with 100+ hook points
- [ ] Unified extension marketplace format supports all four extension types
- [ ] Dependency resolution installs transitive dependencies with conflict detection
- [ ] User can run a recipe with `agentic recipe run code-review` and get a full code review

### Phase 24 — Voice & Multimodal
- [ ] Dictation transcribes speech to text at >95% word accuracy (English, base model)
- [ ] Voice system supports both local (Whisper.cpp) and cloud (Gemini Live) STT
- [ ] TTS synthesizes speech from agent responses with <1s latency (streaming mode)
- [ ] Multimodal input handler processes images, audio, video, and documents
- [ ] Computer controller captures screen, controls mouse/keyboard, and automates browser
- [ ] User can say "Hey Agentic, analyze this image and describe it" and get verbal response

### Phase 25 — Sandbox & Security Isolation
- [ ] WASM sandbox prevents all tested escape attempts
- [ ] Filesystem sandbox enforces path-level read/write restrictions
- [ ] Container sandbox (Docker/Podman) provides full OS-level isolation
- [ ] macOS sandbox profiles apply native sandbox restrictions
- [ ] Policy engine evaluates 10,000+ decisions/second with <5ms latency
- [ ] All four isolation levels (none, filesystem, full, container) work correctly
- [ ] Penetration test finds zero sandbox escape vulnerabilities

---

## Migration Guide for Existing Users

### Goose Users
The extension and recipe systems are fully backward compatible. Your existing YAML recipes and WASM extensions will work unmodified under the new unified system. The main changes you'll notice:
- Extension installation switches to `agentic extension install` (legacy `goose extensions install` aliased)
- Recipe format extended with hooks support (optional, backward-compatible)
- New `agentic local` and `agentic mcp` command groups
- Desktop app gains voice input, TTS, and computer control

### gemini-cli Users
Your hooks and MCP configuration will be migrated automatically:
- Hooks transform to the unified hooks system (priority and dependency fields added)
- MCP configurations remain compatible; OAuth tokens migrate to new storage
- Voice system settings preserved; new local dictation available as alternative STT
- Policy files port to unified format with automatic conversion tool

### Agentic OS V3 Users
Your WASM sandbox configurations and skill definitions are preserved:
- WASM sandbox integrated into the unified sandbox hierarchy
- Skills automatically convert to the unified extension format
- Pipeline builder enhanced with recipe execution support
- Agent orchestration layers (DAG, Pipeline, Graph) remain unchanged in functionality

---

## Appendix A: Key File Index by Subphase

| Subphase | Primary Package | Key Files (count) |
|----------|----------------|-------------------|
| 21.1 | `packages/local-inference/backends/llamacpp/` | 16 files |
| 21.2 | `packages/local-inference/backends/litert/` + `mlx/` | 22 files |
| 21.3 | `packages/local-inference/model-manager/` | 16 files |
| 21.4 | `packages/local-inference/hybrid-router/` | 15 files |
| 21.5 | `packages/local-inference/quantization/` | 17 files |
| 22.1 | `packages/mcp/core/` | 22 files |
| 22.2 | `packages/mcp/client/` | 18 files |
| 22.3 | `packages/mcp/oauth/` | 20 files |
| 22.4 | `packages/mcp/registry/` | 16 files |
| 22.5 | `packages/mcp/security/` | 18 files |
| 23.1 | `packages/extensions/wasm/` | 25 files |
| 23.2 | `packages/extensions/recipes/` | 24 files |
| 23.3 | `packages/extensions/hooks/` | 22 files |
| 23.4 | `packages/extensions/marketplace/` | 20 files |
| 23.5 | `packages/extensions/versioning/` | 22 files |
| 24.1 | `packages/voice/dictation/` | 22 files |
| 24.2 | `packages/voice/` (multiple sub-packages) | 28 files |
| 24.3 | `packages/voice/tts/` | 22 files |
| 24.4 | `packages/multimodal/input/` | 26 files |
| 24.5 | `packages/computer-control/` | 28 files |
| 25.1 | `packages/sandbox/wasm/` | 22 files |
| 25.2 | `packages/sandbox/filesystem/` + `manager/` | 22 files |
| 25.3 | `packages/sandbox/container/` | 22 files |
| 25.4 | `packages/sandbox/macos/` | 20 files |
| 25.5 | `packages/sandbox/policy-engine/` | 24 files |

---

## Appendix B: Subphase Risk Distribution

```
Phase 21: ■■■■■■■■■■ (40% HIGH, 40% MEDIUM, 20% LOW)
  21.1 ■■■■■ (HIGH)
  21.2 ■■■■■ (HIGH)
  21.3 ■■■   (MEDIUM)
  21.4 ■■■■■ (HIGH)
  21.5 ■■■■■ (HIGH)

Phase 22: ■■■■■■■■■ (30% HIGH, 50% MEDIUM, 20% LOW)
  22.1 ■■■   (MEDIUM)
  22.2 ■■■   (MEDIUM)
  22.3 ■■■   (MEDIUM)
  22.4 ■■    (LOW-MEDIUM)
  22.5 ■■■■  (MEDIUM-HIGH)

Phase 23: ■■■■■■■■■ (20% HIGH, 60% MEDIUM, 20% LOW)
  23.1 ■■■■■ (HIGH)
  23.2 ■■    (LOW-MEDIUM)
  23.3 ■■■   (MEDIUM)
  23.4 ■■    (LOW-MEDIUM)
  23.5 ■■■   (MEDIUM)

Phase 24: ■■■■■■■■■ (30% HIGH, 50% MEDIUM, 20% LOW)
  24.1 ■■■■■ (HIGH)
  24.2 ■■■   (MEDIUM)
  24.3 ■■■   (MEDIUM)
  24.4 ■■■■  (MEDIUM-HIGH)
  24.5 ■■■■■ (HIGH)

Phase 25: ■■■■■■■■■ (50% HIGH, 30% MEDIUM, 20% LOW)
  25.1 ■■■■■ (HIGH)
  25.2 ■■■■■ (HIGH)
  25.3 ■■■   (MEDIUM)
  25.4 ■■■   (MEDIUM)
  25.5 ■■■■  (MEDIUM-HIGH)

Total: ■■■■■■■■■ (34% HIGH, 46% MEDIUM, 20% LOW)
```

---

## Appendix C: Team Allocation Recommendation

| Phase | Lead Engineer(s) | Supporting Engineers | Specialist Input |
|-------|-----------------|---------------------|------------------|
| 21.1 | Rust Systems (2) | Build Engineer | GPU backend specialist |
| 21.2 | ML Engineer (2) | TypeScript Engineer | Apple ML specialist |
| 21.3 | Full-Stack (1) | Rust Engineer | HuggingFace API specialist |
| 21.4 | Infrastructure (1) | ML Engineer | Network latency specialist |
| 21.5 | ML Engineer (2) | Rust Engineer | Quantization research |
| 22.1 | Rust Systems (2) | TypeScript Engineer | MCP spec reviewer |
| 22.2 | TypeScript (2) | Platform Engineer | Agent loop specialist |
| 22.3 | Security (1) | Full-Stack (1) | OAuth specialist |
| 22.4 | Full-Stack (1) | Platform Engineer | npm/GitHub API specialist |
| 22.5 | Security (2) | Rust Engineer | Sandbox researcher |
| 23.1 | Rust Systems (2) | WASM Specialist | WASI/ABI designer |
| 23.2 | TypeScript (2) | Recipe Author | YAML schema designer |
| 23.3 | TypeScript (2) | Agent Engineer | Event system designer |
| 23.4 | Full-Stack (2) | Product Manager | Ecosystem coordinator |
| 23.5 | Platform (2) | Security Engineer | SAT solver specialist |
| 24.1 | Rust Systems (2) | Audio Engineer | Whisper.cpp specialist |
| 24.2 | TypeScript (2) | Audio Engineer | WebRTC/audio specialist |
| 24.3 | Full-Stack (2) | Audio Engineer | TTS research & eval |
| 24.4 | Full-Stack (2) | ML Engineer | OCR/video processing specialist |
| 24.5 | Full-Stack (2) | QA Engineer | Accessibility API specialist |
| 25.1 | Rust Systems (2) | Security Engineer | wasmtime specialist |
| 25.2 | Security (2) | TypeScript Engineer | File system security |
| 25.3 | Platform (2) | Security Engineer | Docker/Podman specialist |
| 25.4 | macOS Specialist (1) | Security Engineer | Apple sandbox expert |
| 25.5 | Security (2) | Policy Designer | Policy language design |

---

*End of PART 5 — Phases 21–25*

*Next: PART 6 — Phases 26–30 (Performance Optimization, Platform & Distribution, Marketplace & Community, Testing & Quality, Release & Documentation)*

---

**Total Lines**: ~1,850
**Subphases Documented**: 25 (Phases 21–25, each with 5 subphases)
**Key Files Referenced**: ~520
**Risk Items Catalogued**: 25
**Acceptance Criteria**: ~245 individual checks

#!/usr/bin/env python3
"""Apply all gap fixes to MASTER_INTEGRATION_PLAN_30_PHASES_P1.md"""

import re

path = r"C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/MASTER_INTEGRATION_PLAN_30_PHASES_P1.md"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ========================
# FIX 1: Cargo workspace members (Phase 1.1)
# ========================
old = '      - `agentic-os-gateway` - Gateway core (provider registry, translator)'
new = """      - `agentic-os-gateway` - Gateway orchestration layer (ties sub-crates)
      - `agentic-os-provider-registry` - Provider adapter interface & registry
      - `agentic-os-protocol-translator` - Protocol translation engine
      - `agentic-os-router` - Routing engine (adaptive, budget, latency)
      - `agentic-os-cache` - Multi-tier caching (memory, redis, disk, semantic)
      - `agentic-os-auth` - Auth & OAuth management
      - `agentic-os-billing` - Usage tracking & quotas
      - `agentic-os-safety` - Content safety pipeline (PII, injection, jailbreak)
      - `agentic-os-installer` - Installer & auto-update engine"""
assert old in content, "FIX 1: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 1 applied: Cargo workspace members")

# ========================
# FIX 2: npm workspace members (Phase 1.1)
# ========================
old = '      - `packages/genai` - Gemini integration (@google/genai wrapper)'
new = """      - `packages/genai` - Gemini integration (@google/genai wrapper)
      - `packages/sdk` - Unified programmatic SDK (ACP + MCP + Gateway wrappers)
      - `packages/devtools` - Browser-based DevTools panel
      - `packages/vscode` - VS Code extension (optional)"""
assert old in content, "FIX 2: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 2 applied: npm workspace members")

# ========================
# FIX 3: Root directory structure - crates section (Phase 1.1)
# ========================
old = """    �   ��� core/                      # Agentic OS core types & traits
    �   ��� config/                    # Configuration parser
    �   ��� acp/                       # ACP server implementation
    �   ��� gateway/                   # Gateway core
    �   ��� orchestrator/              # Agent orchestration
    �   ��� mcp/                       # MCP client/server
    �   ��� local-inference/           # Local inference (llama.cpp)
    �   ��� dictation/                 # Whisper dictation
    �   ��� security/                  # Guardrails & security
    �   ��� telemetry/                 # Observability
    �   ��� sandbox/                   # WASM sandbox"""

new = """    �   ��� core/                      # Agentic OS core types & traits
    �   ��� config/                    # Configuration parser
    �   ��� acp/                       # ACP server implementation
    �   ��� gateway/                   # Gateway orchestration (ties sub-crates together)
    �   ��� provider-registry/         # Provider adapter interface & registry
    �   ��� protocol-translator/       # Protocol translation engine
    �   ��� router/                    # Routing engine - adaptive, budget, latency
    �   ��� cache/                     # Multi-tier caching - memory, redis, disk, semantic
    �   ��� auth/                      # Auth & OAuth management
    �   ��� billing/                   # Usage tracking & quotas
    �   ��� orchestrator/              # Agent orchestration
    �   ��� mcp/                       # MCP client/server
    �   ��� local-inference/           # Local inference (llama.cpp)
    �   ��� dictation/                 # Whisper dictation
    �   ��� security/                  # Guardrails, encryption, key management
    �   ��� safety/                    # Content safety pipeline - PII, injection, jailbreak
    �   ��� installer/                 # Installer & auto-update engine
    �   ��� telemetry/                 # Observability
    �   ��� sandbox/                   # WASM sandbox"""

assert old in content, "FIX 3: Could not find old crates section"
content = content.replace(old, new, 1)
print("FIX 3 applied: crates directory structure")

# ========================
# FIX 4: Root directory structure - packages section (Phase 1.1)
# ========================
old = """    �   ��� recipes/                   # Recipe engine (TS)
    �   ��� acp-client/                # ACP client SDK
    �   ��� mcp-client/                # MCP client SDK
    �   ��� genai/                    # Gemini integration (@google/genai)
    �   ��� test-utils/               # Shared test utilities"""

new = """    �   ��� recipes/                   # Recipe engine (TS)
    �   ��� sdk/                       # Unified programmatic SDK
    �   ��� devtools/                  # Browser-based DevTools panel
    �   ��� vscode/                    # VS Code extension (optional)
    �   ��� acp-client/                # ACP client SDK
    �   ��� mcp-client/                # MCP client SDK
    �   ��� genai/                    # Gemini integration (@google/genai)
    �   ��� test-utils/               # Shared test utilities"""

assert old in content, "FIX 4: Could not find old packages section"
content = content.replace(old, new, 1)
print("FIX 4 applied: packages directory structure")

# ========================
# FIX 5: Add providers/ and data/ directories to root structure (Phase 1.1)
# ========================
old = """    ��� tools/                         # Build & dev tools
    �   ��� binary-bundler/           # Single binary bundler script"""

new = """    ��� providers/                      # TS provider adapters (dynamic loading)
    �   ��� openai/                    # OpenAI adapter (TS)
    �   ��� anthropic/                 # Anthropic adapter (TS)
    �   ��� google/                    # Google/Gemini adapter (TS)
    �   ��� ollama/                    # Ollama adapter (TS)
    ��� data/                           # Provider config & pricing data
    �   ��� providers/                 # Provider registry data (JSON)
    �   ��� pricing/                   # Unified pricing data
    ��� tools/                         # Build & dev tools
    �   ��� binary-bundler/           # Single binary bundler script"""

assert old in content, "FIX 5: Could not find tools/ section"
content = content.replace(old, new, 1)
print("FIX 5 applied: providers/ and data/ directories")

# ========================
# FIX 6: Phase 1.2 - Add error taxonomy deliverable
# ========================
old = '| `packages/core/tsconfig.json` | TypeScript configuration |'
new = """| `docs/error-codes.md` | Unified error taxonomy with all codes, HTTP status mappings, and descriptions |
| `packages/core/tsconfig.json` | TypeScript configuration |"""
assert old in content, "FIX 6: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 6 applied: Error taxonomy deliverable")

# ========================
# FIX 7: Phase 2.1 - Audit config options - add billing section
# ========================
old = """   - Agent orchestration (from V3)
   - AI Gateway providers, translation, streaming, routing, resilience (from 9Router, litellm, new-api, OmniRoute2, Portkey)
   - ACP server (from Goose)
   - MCP registry and sandbox (from Goose, 9Router, gemini-cli)
   - Security and guardrails (from V3, Portkey, litellm)
   - Observability (from all projects)
   - Local inference and dictation (from Goose)
   - MITM proxy (from 9Router)
   - RTK compression (from 9Router, OmniRoute2)
   - Skills and recipes (from V3, OmniRoute2, Goose)
   - Billing and quotas (from new-api, litellm)"""

new = """   - Agent orchestration (from V3)
   - AI Gateway providers, translation, streaming, routing, resilience (from 9Router, litellm, new-api, OmniRoute2, Portkey)
   - ACP server (from Goose)
   - MCP registry and sandbox (from Goose, 9Router, gemini-cli)
   - Security and guardrails (from V3, Portkey, litellm)
   - Safety and content safety pipeline (from gemini-cli, Portkey)
   - Observability (from all projects)
   - Local inference and dictation (from Goose)
   - MITM proxy (from 9Router)
   - RTK compression (from 9Router, OmniRoute2)
   - Skills and recipes (from V3, OmniRoute2, Goose)
   - Billing and quotas (from new-api, litellm)
   - SSO and multi-tenant auth (from new-api, Architecture Analysis)
   - UI mode selection (CLI, TUI, desktop, web)
   - Semantic caching configuration (threshold, TTL)"""

assert old in content, "FIX 7: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 7 applied: Phase 2.1 schema sections")

# ========================
# FIX 8: Phase 2.2 - Add provider capability validation to config parser
# ========================
old = '4. **Implement secret redaction** for safe display of config'
new = """4. **Implement capability-aware validation**: Validate that model/provider combinations
   exist in the provider registry; warn on incompatible configurations
5. **Implement secret redaction** for safe display of config"""
assert old in content, "FIX 8: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 8 applied: Phase 2.2 provider validation")

# ========================
# FIX 9: Phase 3.3 - Add pricing merge strategy
# ========================
old = '2. **Integrate litellm\'s routing strategies**:'
new = """2. **Merge pricing data from all sources** (litellm, 9Router, Portkey, new-api):
   - Priority: litellm (most accurate) > new-api (billing records) > Portkey > 9Router
   - Track source provenance in metadata
   - Create `data/providers/pricing/unified-pricing.json` as single source of truth
   - Generate `scripts/merge-pricing.ts` for weekly pricing refresh

3. **Integrate litellm\'s routing strategies**:"""
assert old in content, "FIX 9: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 9 applied: Phase 3.3 pricing merge")

# ========================
# FIX 10: Phase 5 - Add zero-copy optimization to performance notes
# ========================
old = '### Performance Benchmarks (Targets)'
new = """### Performance Optimization Notes

**Zero-Copy Translation Path (GAP-011 mitigation):**
The 9Router translation engine adds ~50ms latency per protocol conversion
(ARCHITECTURE_ANALYSIS §1.4). Phase 5 must implement:

1. **Direct format-to-format optimization**: For the most common translation
   path (OpenAI-*Unified), implement direct field mapping without intermediate
   representation where possible (target: <3ms p50).
2. **Streaming pipeline optimization**: Reuse buffer allocations across chunks;
   minimize cloning in hot paths.
3. **Cached format detection**: Cache auto-detection results per endpoint to
   avoid re-parsing request bodies.

**Tiered Caching Strategy:**
- L1: In-memory exact-match cache (<100μs lookup)
- L2: Redis semantic cache (~5ms with embedding)
- L3: Disk cache for cold start (~50ms)

### Performance Benchmarks (Targets)"""
assert old in content, "FIX 10: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 10 applied: Phase 5 zero-copy optimization notes")

# ========================
# FIX 11: Add audio protocol translation to Phase 5
# ========================
old = '| `crates/gateway/src/translator/engine.rs` | Translation engine |'
new = """| `crates/protocol-translator/src/translator/audio.rs` | Audio message translation (Whisper in, TTS out) |
| `crates/gateway/src/translator/engine.rs` | Translation engine |"""
assert old in content, "FIX 11: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 11 applied: Audio protocol translation")

# ========================
# FIX 12: Phase 5.5 - Add risk register reference
# ========================
old = '3. **Implement stream format converter**:'
new = """3. **Address R4 performance risk**: Stream metrics tracked against benchmarks
   in CI; baseline comparison prevents performance regression

4. **Implement stream format converter**:"""
assert old in content, "FIX 12: Could not find old text"
content = content.replace(old, new, 1)
print("FIX 12 applied: Risk register reference")

# ========================
# Write back
# ========================
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nAll fixes applied successfully!")

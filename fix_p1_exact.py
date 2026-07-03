with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# The EXACT old crates section with Unicode box-drawing chars
# Note: The tree chars are: ├── = \u251c\u2500\u2500, │ = \u2502, └── = \u2514\u2500\u2500
old_section = """├── crates/                        # Rust crates (Cargo workspace)
│   ├── core/                      # Agentic OS core types & traits
│   ├── config/                    # Configuration parser
│   ├── acp/                       # ACP server implementation
│   ├── gateway/                   # Gateway core
│   ├── orchestrator/              # Agent orchestration
│   ├── mcp/                       # MCP client/server
│   ├── local-inference/           # Local inference (llama.cpp)
│   ├── dictation/                 # Whisper dictation
│   ├── security/                  # Guardrails & security
│   ├── telemetry/                 # Observability
│   └── sandbox/                   # WASM sandbox"""

new_section = """├── crates/                        # Rust crates (Cargo workspace)
│   ├── core/                      # Agentic OS core types & traits (unified data model)
│   ├── config/                    # Configuration parser (TOML/YAML/JSON/env)
│   ├── acp/                       # ACP server implementation
│   ├── gateway/                   # Gateway orchestration layer
│   ├── orchestrator/              # Agent orchestration (DAG/Pipeline/Graph/Swarm)
│   ├── mcp/                       # MCP client/server
│   ├── local-inference/           # Local inference (llama.cpp)
│   ├── dictation/                 # Whisper dictation
│   ├── security/                  # Guardrails, encryption, auth framework
│   ├── safety/                    # Content safety pipeline (PII, injection, jailbreak)
│   ├── installer/                 # Installer, auto-update, shell completions
│   ├── telemetry/                 # Observability (OTEL, metrics, traces, logs)
│   ├── sandbox/                   # WASM sandbox for skill isolation
│   ├── provider-registry/         # Provider adapter interface + registry (250+ providers)
│   ├── protocol-translator/       # Protocol translation engine (zero-copy paths)
│   ├── router/                    # Routing engine (adaptive, budget, latency, combo)
│   ├── cache/                     # Multi-tier caching (memory, redis, disk, semantic)
│   ├── auth/                      # Auth & OAuth (20+ providers, SSO, API keys)
│   └── billing/                   # Usage tracking, quotas, payment integration"""

print("Old section found:", old_section in content)
if old_section in content:
    content = content.replace(old_section, new_section)
    print("✅ Replaced crates section")
else:
    print("❌ Exact match failed - checking differences")
    # Debug: show what we have
    idx = content.find("crates/")
    if idx >= 0:
        print("Actual content around crates:")
        print(repr(content[idx:idx+500]))

# Also fix other sections
# 1. Add data/ before docs/
old_data = "├── docs/                          # Documentation (Docusaurus)"
new_data = """├── data/                          # Provider configuration data (pricing, models, registry)
├── docs/                          # Documentation (Docusaurus)"""
if old_data in content:
    content = content.replace(old_data, new_data, 1)
    print("✅ Added data/ directory")
else:
    print("❌ docs/ not found - searching...")
    idx = content.find("docs/")
    if idx >= 0:
        print("Found docs/ at", idx, ":", repr(content[idx:idx+60]))

# 2. Add providers/ before scripts/
old_providers = "├── scripts/                       # Build, test, release scripts"
new_providers = """├── providers/                     # TypeScript provider adapters (dynamic, pluggable)
├── scripts/                       # Build, test, release scripts"""
if old_providers in content:
    content = content.replace(old_providers, new_providers, 1)
    print("✅ Added providers/ directory")
else:
    print("❌ scripts/ not found - searching...")
    idx = content.find("scripts/")
    if idx >= 0:
        print("Found scripts/ at", idx, ":", repr(content[idx:idx+60]))

# 3. Add sdk/ and devtools/ to packages
old_pkgs = """│   ├── core/                      # Shared TS types & interfaces
│   ├── gateway/                   # Gateway TS layer"""
new_pkgs = """│   ├── core/                      # Shared TS types & interfaces
│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)
│   ├── devtools/                  # Browser-based DevTools panel
│   ├── gateway/                   # Gateway TS layer"""
if old_pkgs in content:
    content = content.replace(old_pkgs, new_pkgs, 1)
    print("✅ Added sdk/ and devtools/ packages")
else:
    print("❌ packages section not found - searching...")
    idx = content.find("Shared TS types")
    if idx >= 0:
        print("Found 'Shared TS types' at", idx)
        print("Context:", repr(content[max(0,idx-50):idx+100]))

# 4. Update enterprise template
old_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template"
new_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA, audit, compliance)"
if old_ent in content:
    content = content.replace(old_ent, new_ent)
    print("✅ Updated enterprise template")
else:
    print("❌ Enterprise template not found")

# 5. Add billing/SSO to schema
old_schema = "| `[auth]` | Auth/security section | Phase 2, 3, 6 |"
new_schema = """| `[auth]` | Auth/security section (api_key, oauth, sso, none) | Phase 2, 3, 6 |
| `[auth.sso]` | SSO provider config (OIDC, SAML, OAuth) | Phase 2, 6 |
| `[billing]` | Billing & usage tracking (backend, budgets, alerts) | Phase 2, 7 |
| `[routing.costs]` | Per-model pricing overrides | Phase 2, 4 |
| `[caching.mode]` | Caching strategy: memory, redis, semantic | Phase 2, 3 |
| `[caching.semantic_threshold]` | Semantic cache similarity threshold | Phase 2, 3 |
| `[ui]` | UI mode: cli, tui, desktop, web | Phase 2, 8 |"""
if old_schema in content:
    content = content.replace(old_schema, new_schema, 1)
    print("✅ Added billing/SSO to schema")
else:
    print("❌ Auth schema not found - searching...")
    idx = content.find("[auth]")
    if idx >= 0:
        line_start = content.rfind('\n', 0, idx) + 1
        line_end = content.find('\n', idx)
        print("Found auth line:", repr(content[line_start:line_end]))

# 6. Update performance benchmarks
old_perf = "| Request translation | < 5ms | < 20ms | 50k/sec |"
new_perf = """| Request translation | < 3ms (target: zero-copy OpenAI) | < 10ms | 50k/sec |
| Request translation (zero-copy path) | < 1ms | < 3ms | 100k/sec |"""
if old_perf in content:
    content = content.replace(old_perf, new_perf, 1)
    print("✅ Updated performance benchmarks")
else:
    print("❌ Performance benchmark not found - searching...")
    idx = content.find("Request translation")
    if idx >= 0:
        line_start = content.rfind('\n', 0, idx) + 1
        line_end = content.find('\n', idx)
        print("Found perf line:", repr(content[line_start:line_end]))

# Write back
with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'w', encoding='utf-8-sig') as f:
    f.write(content)

print(f"\nDone. File size: {len(content)} chars")
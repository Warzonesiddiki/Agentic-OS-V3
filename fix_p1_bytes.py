with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'rb') as f:
    data = f.read()

# The expected old section as bytes (using UTF-8 encoding)
old_bytes = "├── crates/                        # Rust crates (Cargo workspace)\n│   ├── core/                      # Agentic OS core types & traits\n│   ├── config/                    # Configuration parser\n│   ├── acp/                       # ACP server implementation\n│   ├── gateway/                   # Gateway core\n│   ├── orchestrator/              # Agent orchestration\n│   ├── mcp/                       # MCP client/server\n│   ├── local-inference/           # Local inference (llama.cpp)\n│   ├── dictation/                 # Whisper dictation\n│   ├── security/                  # Guardrails & security\n│   ├── telemetry/                 # Observability\n│   └── sandbox/                   # WASM sandbox".encode('utf-8')

# Find it in the file
idx = data.find(old_bytes)
if idx >= 0:
    print(f"Found at byte {idx}")
    
    new_bytes = """├── crates/                        # Rust crates (Cargo workspace)
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
│   └── billing/                   # Usage tracking, quotas, payment integration""".encode('utf-8')
    
    data = data[:idx] + new_bytes + data[idx + len(old_bytes):]
    print("Replaced crates section in bytes")
else:
    print("Not found as exact bytes")
    # Try with CRLF
    old_bytes_crlf = old_bytes.replace(b'\n', b'\r\n')
    idx = data.find(old_bytes_crlf)
    if idx >= 0:
        print(f"Found with CRLF at byte {idx}")
        # Replace
        new_bytes_crlf = """├── crates/                        # Rust crates (Cargo workspace)
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
│   └── billing/                   # Usage tracking, quotas, payment integration""".encode('utf-8').replace(b'\n', b'\r\n')
        data = data[:idx] + new_bytes_crlf + data[idx + len(old_bytes_crlf):]
        print("Replaced with CRLF")
    else:
        print("Not found with CRLF either")

# Now do the other fixes on the text
content = data.decode('utf-8')

# Fix data/ directory
old_data = "├── docs/                          # Documentation (Docusaurus)"
new_data = "├── data/                          # Provider configuration data (pricing, models, registry)\n├── docs/                          # Documentation (Docusaurus)"
if old_data in content:
    content = content.replace(old_data, new_data, 1)
    print("Added data/")

# Fix providers/ directory
old_providers = "├── scripts/                       # Build, test, release scripts"
new_providers = "├── providers/                     # TypeScript provider adapters (dynamic, pluggable)\n├── scripts/                       # Build, test, release scripts"
if old_providers in content:
    content = content.replace(old_providers, new_providers, 1)
    print("Added providers/")

# Fix packages
old_pkgs = "│   ├── core/                      # Shared TS types & interfaces\n│   ├── gateway/                   # Gateway TS layer"
new_pkgs = "│   ├── core/                      # Shared TS types & interfaces\n│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)\n│   ├── devtools/                  # Browser-based DevTools panel\n│   ├── gateway/                   # Gateway TS layer"
if old_pkgs in content:
    content = content.replace(old_pkgs, new_pkgs, 1)
    print("Added sdk/ devtools/")

# Fix enterprise
old_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template"
new_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA, audit, compliance)"
if old_ent in content:
    content = content.replace(old_ent, new_ent)
    print("Fixed enterprise")

# Fix schema
old_schema = "| `[auth]` | Auth/security section | Phase 2, 3, 6 |"
new_schema = "| `[auth]` | Auth/security section (api_key, oauth, sso, none) | Phase 2, 3, 6 |\n| `[auth.sso]` | SSO provider config (OIDC, SAML, OAuth) | Phase 2, 6 |\n| `[billing]` | Billing & usage tracking (backend, budgets, alerts) | Phase 2, 7 |\n| `[routing.costs]` | Per-model pricing overrides | Phase 2, 4 |\n| `[caching.mode]` | Caching strategy: memory, redis, semantic | Phase 2, 3 |\n| `[caching.semantic_threshold]` | Semantic cache similarity threshold | Phase 2, 3 |\n| `[ui]` | UI mode: cli, tui, desktop, web | Phase 2, 8 |"
if old_schema in content:
    content = content.replace(old_schema, new_schema, 1)
    print("Fixed schema")

# Fix perf
old_perf = "| Request translation | < 5ms | < 20ms | 50k/sec |"
new_perf = "| Request translation | < 3ms (target: zero-copy OpenAI) | < 10ms | 50k/sec |\n| Request translation (zero-copy path) | < 1ms | < 3ms | 100k/sec |"
if old_perf in content:
    content = content.replace(old_perf, new_perf, 1)
    print("Fixed perf")

# Write back
with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'w', encoding='utf-8-sig') as f:
    f.write(content)

print("Done")
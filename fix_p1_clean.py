with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# The EXACT old crates section with Unicode box-drawing chars
old_section = "├── crates/                        # Rust crates (Cargo workspace)\n│   ├── core/                      # Agentic OS core types & traits\n│   ├── config/                    # Configuration parser\n│   ├── acp/                       # ACP server implementation\n│   ├── gateway/                   # Gateway core\n│   ├── orchestrator/              # Agent orchestration\n│   ├── mcp/                       # MCP client/server\n│   ├── local-inference/           # Local inference (llama.cpp)\n│   ├── dictation/                 # Whisper dictation\n│   ├── security/                  # Guardrails & security\n│   ├── telemetry/                 # Observability\n│   └── sandbox/                   # WASM sandbox"

new_section = "├── crates/                        # Rust crates (Cargo workspace)\n│   ├── core/                      # Agentic OS core types & traits (unified data model)\n│   ├── config/                    # Configuration parser (TOML/YAML/JSON/env)\n│   ├── acp/                       # ACP server implementation\n│   ├── gateway/                   # Gateway orchestration layer\n│   ├── orchestrator/              # Agent orchestration (DAG/Pipeline/Graph/Swarm)\n│   ├── mcp/                       # MCP client/server\n│   ├── local-inference/           # Local inference (llama.cpp)\n│   ├── dictation/                 # Whisper dictation\n│   ├── security/                  # Guardrails, encryption, auth framework\n│   ├── safety/                    # Content safety pipeline (PII, injection, jailbreak)\n│   ├── installer/                 # Installer, auto-update, shell completions\n│   ├── telemetry/                 # Observability (OTEL, metrics, traces, logs)\n│   ├── sandbox/                   # WASM sandbox for skill isolation\n│   ├── provider-registry/         # Provider adapter interface + registry (250+ providers)\n│   ├── protocol-translator/       # Protocol translation engine (zero-copy paths)\n│   ├── router/                    # Routing engine (adaptive, budget, latency, combo)\n│   ├── cache/                     # Multi-tier caching (memory, redis, disk, semantic)\n│   ├── auth/                      # Auth & OAuth (20+ providers, SSO, API keys)\n│   └── billing/                   # Usage tracking, quotas, payment integration"

print("Old section found:", old_section in content)
if old_section not in content:
    # Debug: find the actual section
    idx = content.find("crates/")
    if idx >= 0:
        # Find start of line
        line_start = content.rfind('\n', 0, idx) + 1
        # Find end - look for packages
        pkg_idx = content.find("packages/", idx)
        if pkg_idx >= 0:
            section_end = content.rfind('\n', 0, pkg_idx) + 1
        else:
            section_end = idx + 800
        actual = content[line_start:section_end]
        print("ACTUAL SECTION:")
        print(repr(actual[:800]))
        print("\nEXPECTED SECTION:")
        print(repr(old_section[:800]))
        print("\nDIFF:")
        for i, (a, e) in enumerate(zip(actual, old_section)):
            if a != e:
                print(f"Position {i}: actual={repr(a)} expected={repr(e)}")
                break

# Also fix other sections
# 1. Add data/ before docs/
old_data = "├── docs/                          # Documentation (Docusaurus)"
new_data = "├── data/                          # Provider configuration data (pricing, models, registry)\n├── docs/                          # Documentation (Docusaurus)"
if old_data in content:
    content = content.replace(old_data, new_data, 1)
    print("Added data/ directory")
else:
    print("docs/ not found")

# 2. Add providers/ before scripts/
old_providers = "├── scripts/                       # Build, test, release scripts"
new_providers = "├── providers/                     # TypeScript provider adapters (dynamic, pluggable)\n├── scripts/                       # Build, test, release scripts"
if old_providers in content:
    content = content.replace(old_providers, new_providers, 1)
    print("Added providers/ directory")
else:
    print("scripts/ not found")

# 3. Add sdk/ and devtools/ to packages
old_pkgs = "│   ├── core/                      # Shared TS types & interfaces\n│   ├── gateway/                   # Gateway TS layer"
new_pkgs = "│   ├── core/                      # Shared TS types & interfaces\n│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)\n│   ├── devtools/                  # Browser-based DevTools panel\n│   ├── gateway/                   # Gateway TS layer"
if old_pkgs in content:
    content = content.replace(old_pkgs, new_pkgs, 1)
    print("Added sdk/ and devtools/ packages")
else:
    print("packages section not found")

# 4. Update enterprise template
old_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template"
new_ent = "`crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA, audit, compliance)"
if old_ent in content:
    content = content.replace(old_ent, new_ent)
    print("Updated enterprise template")
else:
    print("Enterprise template not found")

# 5. Add billing/SSO to schema
old_schema = "| `[auth]` | Auth/security section | Phase 2, 3, 6 |"
new_schema = "| `[auth]` | Auth/security section (api_key, oauth, sso, none) | Phase 2, 3, 6 |\n| `[auth.sso]` | SSO provider config (OIDC, SAML, OAuth) | Phase 2, 6 |\n| `[billing]` | Billing & usage tracking (backend, budgets, alerts) | Phase 2, 7 |\n| `[routing.costs]` | Per-model pricing overrides | Phase 2, 4 |\n| `[caching.mode]` | Caching strategy: memory, redis, semantic | Phase 2, 3 |\n| `[caching.semantic_threshold]` | Semantic cache similarity threshold | Phase 2, 3 |\n| `[ui]` | UI mode: cli, tui, desktop, web | Phase 2, 8 |"
if old_schema in content:
    content = content.replace(old_schema, new_schema, 1)
    print("Added billing/SSO to schema")
else:
    print("Auth schema not found")

# 6. Update performance benchmarks
old_perf = "| Request translation | < 5ms | < 20ms | 50k/sec |"
new_perf = "| Request translation | < 3ms (target: zero-copy OpenAI) | < 10ms | 50k/sec |\n| Request translation (zero-copy path) | < 1ms | < 3ms | 100k/sec |"
if old_perf in content:
    content = content.replace(old_perf, new_perf, 1)
    print("Updated performance benchmarks")
else:
    print("Performance benchmark not found")

# Write back
with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'w', encoding='utf-8-sig') as f:
    f.write(content)

print("\nDone.")
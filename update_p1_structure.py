#!/usr/bin/env python3
"""Update P1.md directory structure based on R1 refinement findings."""

import re

with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ============================================================
# 1. UPDATE CRATES SECTION - add missing crates
# ============================================================
old_crates = (
    "├── core/                      # Agentic OS core types & traits\n"
    "│   ├── config/                    # Configuration parser\n"
    "│   ├── acp/                       # ACP server implementation\n"
    "│   ├── gateway/                   # Gateway core\n"
    "│   ├── orchestrator/              # Agent orchestration\n"
    "│   ├── mcp/                       # MCP client/server\n"
    "│   ├── local-inference/           # Local inference (llama.cpp)\n"
    "│   ├── dictation/                 # Whisper dictation\n"
    "│   ├── security/                  # Guardrails & security\n"
    "│   ├── telemetry/                 # Observability\n"
    "│   └── sandbox/                   # WASM sandbox"
)

new_crates = (
    "├── core/                      # Agentic OS core types & traits (unified data model)\n"
    "│   ├── config/                    # Configuration parser (TOML/YAML/JSON/env)\n"
    "│   ├── acp/                       # ACP server implementation\n"
    "│   ├── gateway/                   # Gateway orchestration layer\n"
    "│   ├── orchestrator/              # Agent orchestration (DAG/Pipeline/Graph/Swarm)\n"
    "│   ├── mcp/                       # MCP client/server\n"
    "│   ├── local-inference/           # Local inference (llama.cpp)\n"
    "│   ├── dictation/                 # Whisper dictation\n"
    "│   ├── security/                  # Guardrails, encryption, auth framework\n"
    "│   ├── safety/                    # Content safety pipeline (PII, injection, jailbreak)\n"
    "│   ├── installer/                 # Installer, auto-update, shell completions\n"
    "│   ├── telemetry/                 # Observability (OTEL, metrics, traces, logs)\n"
    "│   ├── sandbox/                   # WASM sandbox for skill isolation\n"
    "│   ├── provider-registry/         # Provider adapter interface + registry (250+ providers)\n"
    "│   ├── protocol-translator/       # Protocol translation engine (zero-copy paths)\n"
    "│   ├── router/                    # Routing engine (adaptive, budget, latency, combo)\n"
    "│   ├── cache/                     # Multi-tier caching (memory, redis, disk, semantic)\n"
    "│   ├── auth/                      # Auth & OAuth (20+ providers, SSO, API keys)\n"
    "│   └── billing/                   # Usage tracking, quotas, payment integration"
)

if old_crates in content:
    content = content.replace(old_crates, new_crates)
    print("✅ Updated crates section (added safety, installer, provider-registry, protocol-translator, router, cache, auth, billing)")
    changes += 1
else:
    print("❌ Old crates section NOT FOUND - checking for alternative pattern...")
    # Try alternate patterns
    if 'core/                      # Agentic OS core types & traits' in content:
        print("   Found 'core/' line - but structure may differ")
    if 'gateway/                   # Gateway core' in content:
        print("   Found 'gateway/' line")

# ============================================================
# 2. ADD data/ DIRECTORY (before docs/)
# ============================================================
old_data = "├── docs/                          # Documentation (Docusaurus)"
new_data = "├── data/                          # Provider configuration data (pricing, models, registry)\n├── docs/                          # Documentation (Docusaurus)"

if old_data in content:
    content = content.replace(old_data, new_data, 1)
    print("✅ Added data/ directory")
    changes += 1
    
# ============================================================
# 3. ADD providers/ DIRECTORY (before scripts/)
# ============================================================
old_providers = "├── scripts/                       # Build, test, release scripts"
new_providers = "├── providers/                     # TypeScript provider adapters (dynamic, pluggable)\n├── scripts/                       # Build, test, release scripts"

if old_providers in content:
    content = content.replace(old_providers, new_providers, 1)
    print("✅ Added providers/ directory")
    changes += 1

# ============================================================
# 4. ADD sdk/ and devtools/ to packages section
# ============================================================
old_packages_after = "├── core/                      # Shared TS types & interfaces\n│   ├── gateway/                   # Gateway TS layer"
new_packages_after = "├── core/                      # Shared TS types & interfaces\n│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)\n│   ├── devtools/                  # Browser-based DevTools panel\n│   ├── gateway/                   # Gateway TS layer"

if old_packages_after in content:
    content = content.replace(old_packages_after, new_packages_after, 1)
    print("✅ Added sdk/ and devtools/ to packages")
    changes += 1

# ============================================================
# 5. Add enterprise template description to Phase 2.3
# ============================================================
old_enterprise = "`crates/config/templates/enterprise.toml` | Enterprise config template"
new_enterprise = "`crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA clustering, audit, compliance)"

if old_enterprise in content:
    content = content.replace(old_enterprise, new_enterprise)
    print("✅ Updated enterprise template description")
    changes += 1

# ============================================================
# 6. Add billing section to Phase 2.1 schema
# ============================================================
old_schema = "| `[auth]` | Auth/security section | Phase 2, 3, 6 |"
new_schema = "| `[auth]` | Auth/security section | Phase 2, 3, 6 |\n| `[auth.sso]` | SSO provider configuration (OIDC, SAML) | Phase 2, 6 |\n| `[billing]` | Billing & usage tracking (backend, budgets, alerts) | Phase 2, 7 |\n| `[routing.costs]` | Per-model pricing overrides | Phase 2, 4 |\n| `[caching.mode]` | Caching strategy: memory/redis/semantic | Phase 2, 3 |\n| `[ui]` | UI mode selection: cli/tui/desktop/web | Phase 2, 8 |"

if old_schema in content:
    content = content.replace(old_schema, new_schema, 1)
    print("✅ Added billing, SSO, routing.costs, caching.mode, ui to schema")
    changes += 1

# ============================================================
# 7. Add testing strategy section to Phase 1
# ============================================================
old_testing = "`tests/` | Integration & e2e tests |"
new_testing = "`tests/` | Integration & e2e tests |\n| `tests/unit/core-types.test.ts` | Core type validation tests |\n| `tests/unit/config-parser.test.ts` | Config parsing tests |\n| `tests/integration/config-migration.test.ts` | Migration tests for all 8 projects |\n| `tests/integration/provider-health.test.ts` | Health check integration tests |"

if old_testing in content:
    content = content.replace(old_testing, new_testing, 1)
    print("✅ Added testing strategy details")
    changes += 1

# ============================================================
# 8. Write updated content
# ============================================================
if changes > 0:
    with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\n✅ SUCCESS: {changes} changes applied to P1.md")
else:
    print(f"\n❌ No changes applied - patterns didn't match")

# Count lines
line_count = content.count('\n') + 1
print(f"File now has {line_count} lines")

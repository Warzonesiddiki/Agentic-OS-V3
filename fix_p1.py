#!/usr/bin/env python3
"""Apply R1 refinement fixes to P1.md - directory structure updates."""

import sys

with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8-sig') as f:
    content = f.read()

log = []
changes = 0

# ============================================================
# 1. UPDATE CRATES SECTION
# ============================================================
# The file has Unicode box-drawing characters. We need exact matches.
# Let's find the crates section by looking for the exact pattern.

# Find the position of the crates section
start_marker = 'crates/                        # Rust crates (Cargo workspace)\n'
end_marker = '\npackages/                      # TypeScript packages'

if start_marker in content and end_marker in content:
    start_idx = content.index(start_marker)
    end_idx = content.index(end_marker)
    old_crates_section = content[start_idx:end_idx]
    
    log.append(f"Found crates section at {start_idx}-{end_idx}")
    log.append(f"Old section starts with: {repr(old_crates_section[:50])}")
    
    # Build new crates section
    new_crates_lines = []
    old_lines = old_crates_section.split('\n')
    
    for line in old_lines:
        stripped = line.strip()
        if stripped.startswith('#') and 'crates' in stripped:
            new_crates_lines.append(line)  # Keep header unchanged
        elif 'core/' in stripped and 'core types' in stripped:
            new_crates_lines.append(line.replace('core types & traits', 'core types & traits (unified data model)'))
        elif 'config/' in stripped and 'Configuration parser' in stripped:
            new_crates_lines.append(line.replace('Configuration parser', 'Configuration parser (TOML/YAML/JSON/env)'))
        elif 'gateway/' in stripped and 'Gateway core' in stripped:
            new_crates_lines.append(line.replace('Gateway core', 'Gateway orchestration layer'))
        elif 'orchestrator/' in stripped:
            new_crates_lines.append(line)
        elif 'mcp/' in stripped:
            new_crates_lines.append(line)
        elif 'local-inference/' in stripped:
            new_crates_lines.append(line)
        elif 'dictation/' in stripped:
            new_crates_lines.append(line)
        elif 'security/' in stripped:
            new_crates_lines.append(line.replace('Guardrails & security', 'Guardrails, encryption, auth framework'))
        elif 'telemetry/' in stripped:
            new_crates_lines.append(line)
        elif 'sandbox/' in stripped:
            new_crates_lines.append(line)
        else:
            new_crates_lines.append(line)
    
    # Now insert new crates after telemetry and before sandbox
    # Find where to add safety, installer, provider-registry, etc.
    result_lines = []
    inserted_crates = False
    last_was_gateway_entry = False
    
    for i, line in enumerate(new_crates_lines):
        stripped = line.strip()
        result_lines.append(line)
        
        # After telemetry line, add the new crates
        if 'telemetry/' in stripped:
            # Get the indentation from the line
            indent = line[:len(line) - len(line.lstrip())]
            
            # Add new crates
            result_lines.append(f'{indent}│   ├── safety/                    # Content safety pipeline (PII, injection, jailbreak)\n')
            result_lines.append(f'{indent}│   ├── installer/                 # Installer, auto-update, shell completions\n')
            result_lines.append(f'{indent}│   ├── provider-registry/         # Provider adapter interface + registry (250+ providers)\n')
            result_lines.append(f'{indent}│   ├── protocol-translator/       # Protocol translation engine (zero-copy paths)\n')
            result_lines.append(f'{indent}│   ├── router/                    # Routing engine (adaptive, budget, latency, combo)\n')
            result_lines.append(f'{indent}│   ├── cache/                     # Multi-tier caching (memory, redis, disk, semantic)\n')
            result_lines.append(f'{indent}│   ├── auth/                      # Auth & OAuth (20+ providers, SSO, API keys)\n')
            result_lines.append(f'{indent}│   └── billing/                   # Usage tracking, quotas, payment integration\n')
            inserted_crates = True
    
    if inserted_crates:
        new_section = ''.join(result_lines)
        content = content.replace(old_crates_section, new_section)
        log.append("Added safety, installer, provider-registry, protocol-translator, router, cache, auth, billing crates")
        changes += 1
    else:
        log.append("Could not find insertion point for new crates")
else:
    log.append("Could not find crates section markers")

# ============================================================
# 2. ADD data/ DIRECTORY
# ============================================================
if '├── docs/                          # Documentation (Docusaurus)' in content:
    content = content.replace(
        '├── docs/                          # Documentation (Docusaurus)',
        '├── data/                          # Provider configuration data (pricing, models, registry)\n├── docs/                          # Documentation (Docusaurus)',
        1
    )
    log.append("Added data/ directory")
    changes += 1

# ============================================================
# 3. ADD providers/ DIRECTORY
# ============================================================
if '├── scripts/                       # Build, test, release scripts' in content:
    content = content.replace(
        '├── scripts/                       # Build, test, release scripts',
        '├── providers/                     # TypeScript provider adapters (dynamic, pluggable)\n├── scripts/                       # Build, test, release scripts',
        1
    )
    log.append("Added providers/ directory")
    changes += 1

# ============================================================
# 4. ADD sdk/ and devtools/ packages
# ============================================================
pkg_pattern = '├── core/                      # Shared TS types & interfaces\n│   ├── gateway/                   # Gateway TS layer'
pkg_replacement = '├── core/                      # Shared TS types & interfaces\n│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)\n│   ├── devtools/                  # Browser-based DevTools panel\n│   ├── gateway/                   # Gateway TS layer'

if pkg_pattern in content:
    content = content.replace(pkg_pattern, pkg_replacement, 1)
    log.append("Added sdk/ and devtools/ packages")
    changes += 1

# ============================================================
# 5. Update enterprise template
# ============================================================
old_ent = 'crates/config/templates/enterprise.toml` | Enterprise config template'
new_ent = 'crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA, audit, compliance)'
if old_ent in content:
    content = content.replace(old_ent, new_ent)
    log.append("Updated enterprise template description")
    changes += 1

# ============================================================
# 6. Add billing/SSO to schema
# ============================================================
old_schema = '| `[auth]` | Auth/security section | Phase 2, 3, 6 |'
new_schema = '| `[auth]` | Auth/security section (api_key, oauth, sso, none) | Phase 2, 3, 6 |\n| `[auth.sso]` | SSO provider config (OIDC, SAML, OAuth) | Phase 2, 6 |\n| `[billing]` | Billing & usage tracking (backend, budgets, alerts) | Phase 2, 7 |\n| `[routing.costs]` | Per-model pricing overrides | Phase 2, 4 |\n| `[caching.mode]` | Caching strategy: memory, redis, semantic | Phase 2, 3 |\n| `[caching.semantic_threshold]` | Semantic cache similarity threshold | Phase 2, 3 |\n| `[ui]` | UI mode: cli, tui, desktop, web | Phase 2, 8 |'

if old_schema in content:
    content = content.replace(old_schema, new_schema, 1)
    log.append("Added billing, SSO, routing.costs, caching config to schema")
    changes += 1

# ============================================================
# 7. Add performance benchmark references  
# ============================================================
old_perf = '| Request translation | < 5ms | < 20ms | 50k/sec |'
new_perf = '| Request translation | < 3ms (target: zero-copy OpenAI) | < 10ms | 50k/sec |\n| Request translation (zero-copy path) | < 1ms | < 3ms | 100k/sec |'

if old_perf in content:
    content = content.replace(old_perf, new_perf, 1)
    log.append("Updated performance benchmarks with zero-copy targets")
    changes += 1

# ============================================================
# Write updated file
# ============================================================
with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'w', encoding='utf-8-sig') as f:
    f.write(content)

log.append(f"\nTotal changes: {changes}")
with open('fix_p1_log.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))

print(f"Done: {changes} changes applied")

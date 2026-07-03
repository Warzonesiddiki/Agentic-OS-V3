param(
    [string]$FilePath = "MASTER_INTEGRATION_PLAN_30_PHASES_P1.md"
)

$c = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)

# === 1. UPDATE CRATES SECTION ===
$oldCrates = '│   ├── core/                      # Agentic OS core types & traits
│   ├── config/                    # Configuration parser
│   ├── acp/                       # ACP server implementation
│   ├── gateway/                   # Gateway core
│   ├── orchestrator/              # Agent orchestration
│   ├── mcp/                       # MCP client/server
│   ├── local-inference/           # Local inference (llama.cpp)
│   ├── dictation/                 # Whisper dictation
│   ├── security/                  # Guardrails & security
│   ├── telemetry/                 # Observability
│   └── sandbox/                   # WASM sandbox'

$newCrates = '│   ├── core/                      # Agentic OS core types & traits (unified data model)
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
│   └── billing/                   # Usage tracking, quotas, payment integration'

Write-Host "Looking for old crates section..."
if ($c.Contains($oldCrates)) {
    $c = $c.Replace($oldCrates, $newCrates)
    Write-Host "✓ Updated crates section"
} else {
    Write-Host "✗ Old crates section not found!"
    Write-Host "Searching for partial match..."
    $idx = $c.IndexOf("core/                      # Agentic OS core types & traits")
    if ($idx -ge 0) {
        Write-Host "Found 'core/' at index $idx"
        Write-Host "Context: " + $c.Substring($idx-30, 100)
    }
}

# === 2. UPDATE PACKAGES SECTION ===
$oldPackages = '├── packages/                      # TypeScript packages (npm workspace)'
$newPackages = '├── packages/                      # TypeScript packages (npm workspace)
│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)
│   ├── devtools/                  # Browser-based DevTools panel (agent inspector)'

Write-Host "`nLooking for packages section..."
if ($c.Contains($oldPackages)) {
    # Find position after the oldPackages line and insert new packages
    $idx = $c.IndexOf($oldPackages)
    $endOfLine = $c.IndexOf("`n", $idx)
    $insertPos = $endOfLine + 1
    # Insert after the packages root line (before first sub-package)
    $c = $c.Insert($insertPos, "│   ├── sdk/                       # Unified programmatic SDK (ACP + MCP + Gateway)`n│   ├── devtools/                  # Browser-based DevTools panel (agent inspector)`n")
    Write-Host "✓ Added sdk/ and devtools/ packages"
} else {
    Write-Host "✗ Packages section header not found"
}

# === 3. ADD data/ DIRECTORY ===
$oldData = '├── docs/                          # Documentation (Docusaurus)'
$newData = '├── data/                          # Provider configuration data (pricing, models, registry)
├── docs/                          # Documentation (Docusaurus)'

if ($c.Contains($oldData)) {
    $c = $c.Replace($oldData, $newData)
    Write-Host "✓ Added data/ directory"
} else {
    Write-Host "✗ docs/ section not found"
}

# === 4. ADD providers/ DIRECTORY ===
$oldProviders = '├── scripts/                       # Build, test, release scripts'
$newProviders = '├── providers/                     # TypeScript provider adapters (dynamic, pluggable)
├── scripts/                       # Build, test, release scripts'

if ($c.Contains($oldProviders)) {
    $c = $c.Replace($oldProviders, $newProviders)
    Write-Host "✓ Added providers/ directory"
} else {
    Write-Host "✗ scripts/ section not found"
}

# Write the updated file
[System.IO.File]::WriteAllText($FilePath, $c, [System.Text.Encoding]::UTF8)
Write-Host "`n=== File updated successfully ==="

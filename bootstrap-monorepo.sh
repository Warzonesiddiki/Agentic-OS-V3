# Agentic OS V4 — bootstrap-monorepo.sh
# Creates the initial monorepo structure
# Usage: bash bootstrap-monorepo.sh <target-directory>

set -e

TARGET="${1:-./agentic-os-v4}"
echo "🚀 Creating Agentic OS V4 monorepo at ${TARGET}"

mkdir -p "${TARGET}"
cd "${TARGET}"

# ── Rust Workspace ────────────────────────────────────────────
mkdir -p crates/core/src/types
mkdir -p crates/core/src/traits
mkdir -p crates/core/src/errors
mkdir -p crates/config/src
mkdir -p crates/provider-registry/src
mkdir -p crates/protocol-translator/src
mkdir -p crates/router/src
mkdir -p crates/router/src/strategies
mkdir -p crates/orchestrator/src
mkdir -p crates/orchestrator/src/dag
mkdir -p crates/orchestrator/src/pipeline
mkdir -p crates/orchestrator/src/graph
mkdir -p crates/orchestrator/src/swarm
mkdir -p crates/streaming/src
mkdir -p crates/cache/src
mkdir -p crates/auth/src
mkdir -p crates/billing/src
mkdir -p crates/sandbox/src
mkdir -p crates/mcp/src
mkdir -p crates/observability/src
mkdir -p crates/safety/src
mkdir -p crates/installer/src
mkdir -p crates/cli/src
mkdir -p crates/cli/src/tui
mkdir -p crates/cli/src/commands

# ── TypeScript Packages ───────────────────────────────────────
mkdir -p packages/dashboard/src
mkdir -p packages/desktop/src
mkdir -p packages/sdk/src
mkdir -p packages/skills/src
mkdir -p packages/recipes/src
mkdir -p packages/devtools/src
mkdir -p packages/vscode/src

# ── Provider Adapters ─────────────────────────────────────────
mkdir -p providers/openai
mkdir -p providers/anthropic
mkdir -p providers/google
mkdir -p providers/ollama
mkdir -p providers/openrouter

# ── Tests ─────────────────────────────────────────────────────
mkdir -p tests/integration
mkdir -p tests/e2e
mkdir -p tests/memory
mkdir -p tests/perf
mkdir -p tests/evals

# ── Docs ──────────────────────────────────────────────────────
mkdir -p docs/getting-started
mkdir -p docs/architecture
mkdir -p docs/api
mkdir -p docs/admin
mkdir -p docs/development
mkdir -p docs/reference

# ── Scripts & Config ──────────────────────────────────────────
mkdir -p scripts
mkdir -p schemas
mkdir -p tools
mkdir -p evals
mkdir -p examples
mkdir -p .github/workflows
mkdir -p .github/ISSUE_TEMPLATE
mkdir -p .devcontainer

echo "✅ Directory structure created"
echo "📁 ${TARGET}"
find "${TARGET}" -type d | sort | head -60

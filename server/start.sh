#!/usr/bin/env bash
# ============================================================================
# start.sh — One-command NEXUS 2.0 server start (macOS/Linux)
#
# No PostgreSQL required. SQLite is used by default — just run this script.
# Set DATABASE_URL to use PostgreSQL instead.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          NEXUS 2.0 — AI Agent OS Server                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed or not on your PATH."
  echo "       Download it from https://nodejs.org (v20 or later)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js v20+ is required. Current version: $(node -v)"
  exit 1
fi

echo "✔ Node.js $(node -v) detected"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "→ Installing dependencies..."
  npm install
  echo "✔ Dependencies installed"
  echo ""
fi

# Print mode
if [ -n "${DATABASE_URL:-}" ]; then
  echo "◆ Database: PostgreSQL (DATABASE_URL is set)"
else
  echo "◆ Database: SQLite (agentic-os.db — no external DB needed)"
fi
echo ""

echo "→ Starting server..."
echo ""
npx tsx src/index.ts

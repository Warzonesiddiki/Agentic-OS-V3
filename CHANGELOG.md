# Changelog

All notable changes to Nexus Agentic OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] — 2026-07-02

### Added — OmniRoute Integration
- **160+ provider routing**: Integrated OmniRoute's full provider catalog, combos,
  fallback policies, and tag router for intelligent LLM request routing
- **Combo resolver**: Priority, weighted, round-robin, random, least-used, and
  cost-optimized strategies for multi-model selection
- **Fallback policy engine**: Declarative fallback chains with SQLite-backed persistence
- **Smart pipeline engine**: Multi-stage LLM execution (draft → reflect → refine)
  with fitness-tier provider selection
- **Cost rules**: Comprehensive token cost calculation across 160+ providers
- **Degradation handling**: Auto-detection and recovery from provider degradation
- **Tag router**: Route requests to models by tag/category
- **Assessment system**: Self-healing, categorization, and migration for provider issues
- **PII masking guardrail**: OmniRoute's production PII masker with redact/block modes
- **Stream PII transform**: Real-time PII sanitization for streaming LLM responses
- **Prompt injection guard**: Dedicated middleware for detecting injection attacks
- **Vision bridge**: Image/analytics analysis with multi-provider routing
- **Semantic cache**: Two-tier LRU+SQLite cache for LLM responses (40-90% token savings)
- **Memory system**: OmniRoute's extraction, injection, retrieval, and summarization
- **Skills registry**: OmniRoute's skill system with A2A protocol, builtins, and custom skills
- **Model lockout/resilience**: Provider lockout settings and circuit-breaker patterns
- **Token health check**: Comprehensive provider credential validation
- **Pricing sync**: Real-time model pricing synchronization
- **Idempotency layer**: Request deduplication for safe retries
- **Tool policy**: Declarative tool access policies
- **44 OmniRoute skills**: Full skill catalog for CLI tools, providers, routing, compression,
  resilience, MCP, A2A, tunnels, webhooks, and more
- **OmniRoute documentation**: Architecture, compression, frameworks, security, ops,
  and reference docs integrated into docs/omniroute/

### Changed
- Unified OmniRoute's guardrail system alongside Nexus's existing guardrails
- Extended provider support from 6 to 160+ LLM providers
- Added OmniRoute's cost tracking alongside Nexus's token ledger

## [2.0.0] — 2026-07-01

### Added
- Agentic OS kernel: syscalls, scheduler, saga orchestration, message bus, virtual filesystem
- Ring-based access control (personal → interactive → background → maintenance)
- Hash-chained, tamper-evident audit log with SHA-256 and Merkle checkpoints
- MCP (Model Context Protocol) server for AI agent tool integration
- Input/output guardrails: SQL injection detection, PII redaction, toxicity screening
- Rate limiting on all API routes (per-IP, per-endpoint type)
- Auth backstop: every `/api/v1/*` route requires authentication except health
- Semantic recall with Reciprocal Rank Fusion (RRF)
- Session capture with never-lose-transcript invariant
- Self-improving skill compiler
- Pipeline DAG visual editor (React Flow)
- Live agent dashboard with spawn/pause/resume/kill controls
- Approval gates for high-risk operations
- Tauri desktop app with Node.js sidecar backend
- Health endpoints: `/api/v1/health` and `/api/v1/health/detailed`
- Production-safe logger for browser code (silent in production)
- GitHub Actions CI with PostgreSQL service
- Issue templates, PR template, Dependabot config, SECURITY.md

### Security
- CSP hardened: removed `unsafe-eval` from script-src
- API key authentication with bcrypt hashing and constant-time comparison
- Kill switch for emergency mutation blocking (HTTP 423)
- CORS and security headers middleware
- `.env` files excluded from version control
- Port file cleanup on Tauri app exit

### Changed
- Upgraded to TypeScript 5.9 with strict mode
- Migrated to Hono v4 HTTP framework
- All `any` types replaced with `unknown` or proper generics
- `agent-orchestrator-infrastructure.ts` fully type-safe (removed `@ts-nocheck`)
- Version bumped from 0.0.0 to 2.0.0

### Fixed
- `await` inside non-async callback in server entry point
- Invalid `allowTopLevelAwait` in server tsconfig
- Browser-unsafe Node.js APIs in `agent-manifest.ts`
- Always-nullish expression in `kernel.ts`
- Port mismatch between Vite config and Tauri config (unified to 1422)
- Guardrails tests failing without PostgreSQL (mocked audit module)
- 20+ unused import/variable TypeScript errors across server services
- `window as any` type-unsafe cast replaced with proper Window interface extension
- Tauri app identifier updated from `com.yourcompany.nexus` to `com.nexus-agentic-os.app`

### Removed
- Dead npm dependencies (drizzle-orm-sqlite, better-sqlite3, pkg, nexe)
- Unused Rust import (tauri::path::PathResolver)
- 12 debug/utility JS files from server root

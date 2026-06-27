# Security

## Threat model

NEXUS accepts input from AI agents (MCP/REST/CLI) and humans (dashboard). Agents
are semi-trusted: they may propose actions, but destructive/high-risk actions are
policy-gated or require human approval. The system must resist prompt injection,
secret exfiltration, SSRF, path traversal, and unbounded resource consumption.

## Authentication & authorization

- **API keys** are hashed and never stored raw. Only a 4-char preview is retained.
  - Browser build: SHA-256 with domain separator (`nexus::v2::`).
  - Server build: **scrypt** (Node's audited KDF) with random salt, constant-time
    comparison via `crypto.timingSafeEqual`.
- **Constant-time comparison** mitigates timing attacks on both builds.
- Every **mutation** (POST/PATCH/PUT/DELETE) requires auth.
- Sensitive **reads** require auth + scope: memories list, brain export, vault
  notes, audit, MCP resources.
- Public surface is limited to `GET /health`.
- **Scopes**: `memory:read/write`, `skill:read/write`, `brain:admin`,
  `vault:read/write`, `safety:write`, `audit:read`.

## Agentic OS access control

- **Execution rings** 0–4 (kernel → trusted-CLI → MCP → remote → quarantined).
- **Tool registry** with risk levels (`safe|read|write|destructive|network|privileged`),
  minimum ring, required scopes, and `approvalRequired` flags.
- **Approval gates** for destructive shell, file delete, git reset/clean, package
  install, brain import, vault write-back, policy/key changes.
- Destructive commands (`rm -rf /`, fork bombs, `mkfs`, `dd`, `DROP TABLE`) are
  **hard-blocked**; dangerous commands require approval.
- Quarantined agents (ring 4) cannot mutate.

## Input validation

- All REST bodies/queries and MCP tool args validated with **Zod**.
- Structured 400 errors on invalid input; no route trusts raw JSON.
- Route/path params are validated and used safely.

## Resource protection

- **Payload limit** enforced before body parsing (HTTP 413).
- **Rate limiting** (token bucket) keyed by principal/origin (HTTP 429).
- **Bounded growth**: pruning + hard caps on every append-only collection.
- **Recall** never exceeds the token budget.

## Data protection

- Brain **export never includes** API keys, principal hashes, or raw secrets.
- Brain **import** is schema-validated (cannot inject invalid records).
- Secret-like strings are detected (AWS/GitHub/OpenAI keys, private key blocks)
  and would be redacted from audit payloads.
- `.env` is git-ignored.

## Detection (live in Safety Lab + benchmark)

- Prompt-injection patterns (score + matches).
- Secret/key patterns.
- SSRF: private/loopback/link-local metadata IPs blocked.
- Path traversal: `..`, null bytes, vault-root escape rejected.

## Production hardening checklist

1. Run behind a reverse proxy with TLS (no localhost origins).
2. Set `NODE_ENV=production`, real `ALLOWED_ORIGINS`, strong operator keys.
3. Use hashed DB-stored principals; rotate keys; enforce least-privilege scopes.
4. Configure an LLM/embedding provider (or accept lexical fallback).
5. Keep payload limits small; tune rate limits per deployment.
6. Back up the brain export regularly; verify the audit chain.
7. Resolve `npm audit` high/critical advisories before shipping.

## Known gaps (honest)

- localStorage is unencrypted and per-origin (not a production secret store).
- No real network egress controls (SSRF is classified, not enforced at the socket).
- Concurrency correctness depends on DB constraints in the server port.

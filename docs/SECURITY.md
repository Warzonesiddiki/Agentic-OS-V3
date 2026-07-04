# Security

## Threat model

NEXUS accepts input from AI agents (MCP/REST/CLI) and humans (dashboard). Agents
are semi-trusted: they may propose actions, but destructive/high-risk actions are
policy-gated or require human approval. The system must resist prompt injection,
secret exfiltration, SSRF, path traversal, and unbounded resource consumption.

## Sandbox isolation architecture

NEXUS executes untrusted user/agent code inside a **multi-layer sandbox** with
three independent security boundaries:

### Layer 1: AST Pre-Parsing (gate before execution)

Before any code reaches an execution context, the `sandbox.ts` entry point parses
the code using `acorn` (a safe, pure-JS parser). This layer:

- Validates syntactic correctness — malformed code is rejected immediately.
- Scans for **dangerous token patterns** including `process`, `require()`,
  `import()`, `__proto__`, `constructor.constructor`, and `globalThis.process`.
- Blocks code containing these patterns with a `Rejected:` error message before
  any isolate or worker is created.
- Operates in the main thread with no side effects — safe even if the input is
  malicious.

### Layer 2: Worker Thread Isolation (primary execution boundary)

After AST validation, code executes inside a dedicated **Node.js Worker Thread**
with these constraints:

| Protection                    | Implementation                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| **Separate V8 isolate**       | Each worker runs in its own JavaScript isolate with no shared references.                     |
| **Memory limits**             | `resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 }`                |
| **Timeouts**                  | `worker.terminate()` kills the isolate after configurable timeout (default 30s).              |
| **Frozen prototypes**         | `Object.freeze(Object.prototype)`, `Array.prototype`, `Function.prototype` at worker startup. |
| **Dangerous globals blocked** | `require`, `process`, `import`, `globalThis.fetch` are removed or replaced with throw stubs.  |
| **Message-passing only**      | No shared `ArrayBuffer` or `SharedArrayBuffer` — structured clone protocol via `postMessage`. |
| **No env inheritance**        | Workers spawn with `env: {}` — no access to host environment variables.                       |

### Layer 3: Warm Worker Thread Pool

A pre-allocated pool of 4 worker threads eliminates cold-start latency:

- Workers are created once at first request and reused across executions.
- The pool uses a busy/available tracking mechanism — if all workers are busy,
  the request fails with a clear error rather than queueing.
- If a worker is terminated due to timeout, it is **replaced** with a fresh
  worker to maintain pool size.

### Docker Sandbox (optional, higher isolation)

When `NEXUS_SANDBOX_ENABLED=true` and Docker is available, code executes inside
ephemeral Docker containers with:

- `--network none` (no network access)
- `--memory 256m` (RAM cap)
- `--cpus 0.5` (CPU cap)
- `--stop-timeout` (SIGTERM + SIGKILL)
- Read-only volume mounts (host code injected read-only)

### Known Limitations

- Worker threads share the same OS process — a host-level vulnerability (e.g.
  V8 zero-day) could escape the worker boundary.
- Docker sandbox provides stronger isolation but requires Docker daemon access
  and incurs higher startup latency (~200-500ms per execution).
- The AST pre-parsing layer uses regex for dangerous token detection, which is
  a heuristic, not a formal proof. It is a defense-in-depth layer, not a
  primary security boundary.

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

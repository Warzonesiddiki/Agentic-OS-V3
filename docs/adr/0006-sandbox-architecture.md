# 0006 – Sandbox Architecture: Worker Threads + Docker Dual Path

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

NEXUS allows agents (and through them, users) to execute arbitrary code —
the skill compiler, pipeline runner, and code evaluation features all need
to run untrusted JavaScript or Python. Running this code in the main
process would expose the entire system to:

- Infinite loops / memory exhaustion (denial of service).
- Access to `process`, `require`, `child_process`, `fs` (secret
  exfiltration, host compromise).
- Prototype pollution and sandbox escape via `constructor.constructor`,
  `Proxy`, `Reflect`, or `Symbol`.
- Network exfiltration via `fetch`, `WebSocket`, or DNS tunneling.

The sandbox must block these vectors while remaining fast enough for
interactive skill execution and pipeline steps.

## Decision

### Three-layer defense-in-depth architecture

```
Layer 1: AST pre-parsing (gate before execution)
Layer 2: Worker thread isolation (primary execution path)
Layer 3: Optional Docker isolation (higher-guarantee path)
```

### Layer 1: AST Pre-Parsing (server/src/services/sandbox.ts)

Before any code reaches an execution context, the entry point:

1. Normalizes the code to NFC to defeat Unicode confusable attacks.
2. Decodes Unicode escape sequences (e.g., `\u0070rocess`) and scans
   both representations.
3. Runs regex-based dangerous token detection against 18 patterns:
   `process`, `require()`, `import()`, `__proto__`,
   `constructor.constructor`, `globalThis.*`, `new Function()`,
   `eval()`, `new Proxy()`, `Buffer`, `setTimeout`/`setInterval`,
   `queueMicrotask`, `fetch`, `Symbol`, `AsyncFunction`.
4. Parses the code with `acorn` (ECMAScript 2022) into a full AST.
5. Walks the AST to block blocked identifiers (`process`, `require`,
   `Reflect`, `WebAssembly`, etc.), member access to dangerous
   properties (`__proto__`, `constructor`, `caller`, `callee`), and
   dynamic computed member access expressions.
6. Blocks `ThisExpression` (context climbing), dynamic `import()`, and
   `new Proxy()`.

A rejection at layer 1 never reaches any execution context — the error
message is returned from the main thread with zero side effects.

### Layer 2: Worker Thread Isolation (server/src/services/sandbox-worker.ts)

After AST validation, code executes inside a dedicated Node.js Worker
Thread:

| Protection                | Implementation                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| Separate V8 isolate       | Each worker is an independent isolate — no shared references                   |
| Memory limit              | `resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 }` |
| Timeout                   | `worker.terminate()` kills the isolate (default 30s)                           |
| Frozen prototypes         | `Object.freeze(Object.prototype)`, `Array.prototype`, `Function.prototype`     |
| Dangerous globals blocked | `require`, `process`, `import`, `globalThis.fetch` removed or stub-thrown      |
| No shared memory          | Structured clone via `postMessage` — no `SharedArrayBuffer`                    |
| No env inheritance        | Workers spawn with `env: {}`                                                   |

#### Warm Worker Thread Pool

A pre-allocated pool of **4 worker threads** eliminates cold-start
latency:

- Workers are created once at first request and reused.
- Busy/available tracking — if all workers are busy, the request fails
  with a clear error (no unbounded queueing).
- Terminated workers (timeout) are replaced automatically to maintain
  pool size.

### Layer 3: Docker Sandbox (optional, higher isolation)

When `NEXUS_SANDBOX_ENABLED=true` and Docker is available (detected via
`docker info`), code executes in ephemeral Docker containers:

| Setting      | Value                                      |
| ------------ | ------------------------------------------ |
| Network      | `--network none`                           |
| RAM          | `--memory 256m`                            |
| CPU          | `--cpus 0.5`                               |
| Stop timeout | SIGTERM + SIGKILL                          |
| Filesystem   | Read-only volume mount (`:ro`)             |
| User         | Non-root (`--user node`)                   |
| Cleanup      | `rm -rf` temp directory in `finally` block |

The fallback decision:

```
if NEXUS_SANDBOX_ENABLED && docker available → Docker sandbox
else → worker thread sandbox
```

### Audit and telemetry

Every sandbox execution is recorded:

1. **Database** (`sandboxExecutions` table): id, agentId, type
   (docker/worker), code (truncated to 5KB), language, exit code,
   stdout/stderr (truncated), duration, status.
2. **Audit chain** (`appendAudit`): sandbox id, type, language,
   duration, ok/exitCode, SHA-256 code hash (first 16 hex chars).
3. **Prometheus counters**: total executions, success/failure count,
   latency total/max/avg.

## Consequences

Positive:

- Defense-in-depth: AST parsing catches static patterns, the worker
  enforces them at runtime, and Docker adds a host-level boundary.
- The warm worker pool makes the common path fast (~1–5ms overhead per
  execution after initial warmup).
- Docker path provides genuine OS-level isolation for untrusted code
  (separate PID namespace, network namespace, filesystem).
- Full audit trail enables forensic analysis of sandbox escape attempts
  (rejected code, code hashes, exit codes).

Negative:

- Regex + AST heuristic is not a formal proof — a determined attacker
  with a V8 zero-day could bypass layers 1 and 2.
- Docker path adds 200–500ms per execution (container creation + image
  pull on first run).
- The worker pool is fixed at 4 — burst loads are rejected rather than
  queued (intentional design choice to avoid back-pressure).
- Python execution in Docker depends on the sandbox image having
  `python3` installed — no Python worker thread path exists yet.
- Nested sandbox (agent running sandboxed code that spawns more sandboxed
  code) is not supported — `Worker` and `child_process` are blocked
  inside the worker.

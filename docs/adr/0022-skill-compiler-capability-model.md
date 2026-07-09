# ADR-0022: Skill-Compiler Capability Model

- Status: Accepted
- Date: 2026-07-09
- Deciders: Artisan (owner), Sentinel, Mnemosyne, Leader

## Context

`server/src/services/skill-compiler.ts` does **neural skill compilation** — it
scans `audit_log` + `trajectory_logs` for repeated LLM task patterns, and when a
pattern recurs ≥ `NEXUS_COMPILATION_THRESHOLD` (default 5) times, it generates a
deterministic JS function, evals it against historical outputs, and if it matches
≥ `NEXUS_EVAL_MATCH_THRESHOLD` (default 1.0) it hot-swaps the LLM call with native
code. This saves tokens/latency but introduces **untrusted generated code** that
must be capability-gated like plugins (ADR-0019).

## Decision

The compiler reuses the plugin capability model:

- **Pattern detection:** `DetectedPattern` (signature, input/output shape,
  occurrences, avg tokens) drives `compileSkill`-style extraction; the generated
  function runs in `node:vm` via `runInNewContext` (sandboxed context), never the
  main realm.
- **Capability gating:** compiled scripts call host functions through
  `checkCapability(plugin, cap)` from `wasm-plugin-runtime.ts` and carry a
  `CapabilitySpec` from `plugin-manifest.ts` — same fail-closed deny model as
  WASM plugins. A compiled skill without the needed capability is rejected.
- **Audit + integrity:** every activation calls `appendAudit` (Aegis
  `audit-engine.ts`) and the script bytes are hashed (`createHash`) so a compiled
  skill can be verified/reverted. Activated scripts are hot-swapped into the task
  path, replacing the LLM call for that signature.
- **Injection hardening (2026-07-09):** untrusted `taskLabel` / `sampleOutputs`
  are embedded into the generated module's block comment only after
  `sanitizeForComment()` (escapes `*/` → `* /`, `/*` → `/ *`, strips newlines),
  closing a template-injection RCE that let a crafted label break out of the
  comment. See `SECURITY.md` "Recent Security Fixes".

## Consequences

- Deterministic, repeated tasks run as native code — large token/latency win —
  without opening an arbitrary-code-execution hole (vm sandbox + capability deny +
  comment sanitization).
- Compiled skills are first-class audit/integrity subjects, same as plugins.
- Threshold knobs (`NEXUS_COMPILATION_THRESHOLD`, `NEXUS_EVAL_MATCH_THRESHOLD`)
  tune the aggressiveness; conservative defaults keep false-activations near zero.
- Tests: `skill-compiler.test.ts` covers pattern detection, eval-match gate,
  capability deny, comment-injection neutralization, and audit append on activation.
- Operational note: a bad compiled skill is reverted via the hash + audit trail;
  the kill-switch (Phase 1.7) halts all hot-swaps.

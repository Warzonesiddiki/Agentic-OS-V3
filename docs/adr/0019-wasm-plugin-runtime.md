# ADR-0019: WASM Plugin Runtime (sandboxed execution)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Artisan (owner), Sentinel, Forge, Leader
- Supersedes: ADR-0006 (Sandbox Architecture)

## Context

Plugins (ADR-0017) must execute **untrusted** code. The OS already has a sandbox
(`sandbox.ts`, `sandbox-worker.ts`) for processes, but plugins need a lighter,
in-process, memory-safe runtime with a controlled capability surface and resource
limits — without spawning OS processes per plugin.

## Decision

`server/src/services/wasm-plugin-runtime.ts` executes plugins as WebAssembly:

- **Load + verify:** a WASM module is instantiated with a fixed, allow-listed
  import table (host functions only — no raw FS/network). Module bytes are
  integrity-checked against the marketplace hash (`crypto-suite.ts`) before
  instantiation.
- **Resource fuse:** a `resource-fuse` meter enforces CPU-instruction and memory
  ceilings per invocation; on breach the instance is **trapped and quarantined**
  (`plugin_quarantined: resource_fuse`), emitting a Sentinel event.
- **Capability gating:** host functions exposed to a plugin are filtered by the
  plugin's `capabilities` manifest; denied calls fail closed (the
  `checkCapability` deny-list path).
- **Integrity gate:** a failed integrity check yields
  `integrity_gate_failed: <reason>` and the plugin is never instantiated.
- **Isolation:** WASM linear memory is the only state a plugin can touch; all
  cross-plugin/HOS communication goes through the allow-listed host calls, which
  route back into the kernel `enqueueTask` seam — so plugins cannot escape their
  namespace.

## Consequences

- Plugins run in-process, sandboxed, and resource-bounded — closing the Phase 19
  "WASM sandbox" item with far lower overhead than per-plugin OS sandboxes.
- Fail-closed capability + integrity + resource-fuse triple gate makes the
  marketplace safe to open to third parties.
- Forge's kernel remains the only ingress for plugin-side effects, preserving the
  exclusive-namespace contract and the audit trail (Aegis).
- Tests: `wasm-plugin-runtime.test.ts` covers integrity-fail, resource-fuse
  quarantine, capability deny, and a happy-path host-call round trip.

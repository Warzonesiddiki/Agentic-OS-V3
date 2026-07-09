# ADR-0017: Plugin Marketplace (real backend, reviews, WASM sandbox)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Artisan (owner), Sentinel, Aegis, Leader
- Supersedes: ADR-0008 (A2A Packaging — plugin manifest)

## Context

Skills/plugins (`server/src/services/skill.service.ts`,
`skill-compiler.ts`, `plugin-manifest.ts`) were locally installed. Phase 19
requires a **real marketplace**: publish, discover, install, review, and run
plugins **sandboxed in WASM** (see ADR-0019) with supply-chain integrity.

## Decision

`server/src/services/marketplace.service.ts` is the marketplace backend:

- **Publish:** `publishPluginSchema` / `publishVersionSchema` validate a plugin
  manifest + WASM bundle; the package is stored with a content hash
  (`crypto-suite.ts`) and an integrity record (Aegis `evidence-collector.ts`).
- **Dependency closure:** `resolveDependencyClosure(...)` walks the
  `plugin-manifest` dependency graph so installs are atomic and reproducible.
- **Reviews & ratings:** `reviewSchema` + `installSchema` persist reviews and
  install counts; ratings feed discovery ranking (`ranking-trainer.ts` reuse).
- **Install/run:** installation writes the WASM module to the plugin store;
  execution goes through the WASM runtime (ADR-0019), never the host process.
- **Supply chain:** every published bundle is scanned by `supply-chain.ts` /
  `dlp-scanner.ts` before it becomes installable; quarantine (Sentinel
  `quarantine.ts`) holds anything flagged.

## Consequences

- Plugins are now first-class, discoverable, reviewable, and run isolated in WASM
  — closing the Phase 19 ecosystem item.
- Marketplace data lives in Drizzle tables (`db/schema.ts` marketplace tables),
  so it survives restarts and is queryable via `routes/marketplace-routes.ts`.
- Integrity + supply-chain scanning make the marketplace safe-by-default; nothing
  runs on the host, satisfying the no-arbitrary-code-execution posture.
- Tests: `marketplace.service.test.ts` covers publish validation, dependency
  closure, review persistence, and quarantine-on-scan-flag.

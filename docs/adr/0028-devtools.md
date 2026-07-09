# ADR-0028: Developer Tools (`@agentic-os/devtools`)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Artisan (owner), Bastion, Prism, Leader

## Context

Operators/developers needed local helpers to inspect the OS, generate clients, and
debug the runtime without poking the server by hand. The SDK (ADR-0026) is the
typed client; devtools wrap it with ergonomic CLIs/helpers for the dev loop.

## Decision

`packages/devtools/` is the developer-tooling package (Artisan-owned, alongside the
SDK):

- **`index.ts`** is the barrel exporting the devtool helpers (scaffolding, client
  inspectors, mock servers, replay/recording helpers built on `session-recorder`).
- Consumes `@agentic-os/sdk` (the typed client) rather than re-implementing HTTP —
  single contract, no drift.
- Provides **local dev affordances**: spin up an in-memory server for tests, dump
  the kernel/scheduler state, replay a `session-recorder` transcript against the
  loop — all read-only or sandboxed so devtools can't mutate production state.
- Built/tested with the workspace (`pnpm -r`), so a broken devtool fails CI like
  any other member.

## Consequences

- Devs get ergonomic, SDK-backed tooling instead of hand-rolled curl — faster,
  safer debugging.
- Devtools depend on the SDK contract; a breaking SDK change breaks devtools in CI,
  keeping the two in sync.
- Read-only/sandboxed by design, so devtools are safe to run against a dev instance.
- Tests: `packages/devtools` vitest covers scaffolding output + client-inspector
  round-trips against a mock server (devtools smoke test).
- Operational note: devtools are dev-only; they are not shipped in the production
  server bundle (tree-shaken out).

# ADR-0026: SDK Design (`@agentic-os/sdk`)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Artisan (owner), Aeon, Prism, Leader
- Supersedes: — (Phase 16 DX)

## Context

External developers and the dashboard both need a stable, typed client to the OS
API. Hand-rolling fetch calls duplicates types and breaks on contract changes. We
need one published SDK consumed by the server (tsconfig `paths` alias) and by
third parties, with no drift from the server's public surface.

## Decision

`packages/sdk/` is the single SDK package (`@agentic-os/sdk`, private workspace
pkg), built with `tsc`, tested with `vitest run`:

- **Barrel (`index.ts`):** re-exports `acp`, `types`, `bindings`, `client`,
  `webhooks`, `errors`, `openapi` — one import surface.
- **`client.ts`:** the typed HTTP/SSE client (server + dashboard consume it via the
  `@agentic-os/sdk` path alias).
- **`acp.ts`:** the Agent Client Protocol types (external APIs use REST/MCP/SSE
  per AGENTS.md; ACP is the SDK's typed contract).
- **`openapi.ts`:** generated/derived OpenAPI bindings so the SDK cannot drift from
  the server's REST contract (Bastion's OpenAPI step feeds this).
- **`webhooks.ts` / `bindings.ts`:** event ingress + framework bindings.
- **No `ts-rs`:** per ADR-0007 there is no Rust→TS binding generation; SDK types
  are hand-authored TS, the single source of truth for client code.

## Consequences

- Server, dashboard, and external devs share one typed contract — contract changes
  surface as a compile error in the SDK consumer, not a runtime surprise.
- The OpenAPI-derived `openapi.ts` keeps the REST surface and the SDK in lockstep.
- SDK is built/tested independently (`packages/sdk` under `pnpm -r`), so a broken
  SDK fails the workspace build before it reaches the app.
- Tests: `packages/sdk` vitest covers client round-trips and ACP type parity.
- Operational note: bump the SDK `version` + changelog on any public-surface change;
  Bastion owns the publish sign-off (`server/package.json` dep bumps).

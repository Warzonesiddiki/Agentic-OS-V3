# propagation

## Purpose
W3C trace-context propagation helpers. Parse/format/inject/extract `traceparent` headers so a trace id and
span id flow across HTTP calls and into the tracing layer. Shared FROZEN-surface module (imported by
`app.ts`, `llm.ts`, `http.ts`).

## Public exports
- `function parseTraceparent(header?): TraceContext | null`.
- `function formatTraceparent(ctx: TraceContext): string`.
- `function extractTraceparent(reqLike): TraceContext | null`.
- `function injectTraceparent(ctx, headers): void`.

## Env vars
None directly.

## Test file
- `server/tests/propagation.test.ts` (parse/format round-trip, inject/extract).

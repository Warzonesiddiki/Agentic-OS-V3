# tracing

## Purpose
OpenTelemetry-compatible tracing layer (custom lightweight tracer; `@opentelemetry/api` available). Generates
trace/span ids, runs work inside a trace context, starts LLM/tool spans with token-usage + error recording,
ends spans, and injects `traceparent` into outbound headers. Shared FROZEN-surface module (imported by
`app.ts`, `llm.ts`, `http.ts`, `propagation.ts`).

## Public exports (selected)
- `function generateTraceId(): string`, `generateSpanId(): string`.
- `interface SpanEvent`, `interface InternalSpan`.
- `interface CustomTracer`, `function getTracer(): CustomTracer`.
- `function runWithTraceContext(ctx, fn): Promise<void>`.
- `interface LLMSpanHandle`, `function startLLMSpan(...)`.
- `function startToolSpan(...)`.
- `interface TokenUsage`, `function recordTokenUsage(handle, usage)`.
- `function recordSpanError(handle, message)`, `endTracedSpan(handle): Promise<void>`.
- `function injectTraceparent(headers): void`, `function getTraceProvider()`.
- `function withSpan<T>(name, fn, opts?): Promise<T>` — general span wrapper.

## Env vars
None directly.

## Test file
- `server/tests/tracing.test.ts` (id gen, runWithTraceContext, span lifecycle).

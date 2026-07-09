/**
 * span-context.ts — W3C traceparent-style context propagation helpers.
 *
 * Exports the surface consumed by propagation.ts: `TraceContext` (type) and
 * `getTraceContext`. Also provides parse/format for traceparent strings. (tracing.ts
 * re-exports the parse/format symbols for app.ts; both modules stay compatible.)
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContext {
  version: string;
  traceId: string;
  spanId: string;
  flags: string;
}

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const _store = new AsyncLocalStorage<TraceContext | undefined>();

export function parseTraceParent(header: string | undefined | null): TraceContext | undefined {
  if (!header) return undefined;
  const m = TRACEPARENT_RE.exec(header.trim());
  if (!m) return undefined;
  return {
    version: m[1] ?? '',
    traceId: m[2] ?? '',
    spanId: m[3] ?? '',
    flags: m[4] ?? '01',
  };
}

export function formatTraceParent(tp: TraceContext): string {
  return `${tp.version}-${tp.traceId}-${tp.spanId}-${tp.flags}`;
}

export function randomTraceParent(): TraceContext {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return { version: '00', traceId: hex(32), spanId: hex(16), flags: '01' };
}

/** Run `fn` with `tp` as the active parent context. */
export function withParentContext<T>(tp: TraceContext | undefined, fn: () => T): T {
  return _store.run(tp, fn);
}

/** Read the currently active parent context (from async-local store). */
export function getTraceContext(): TraceContext | undefined {
  return _store.getStore();
}

/** Build a `traceparent` header for outgoing requests from the active context. */
export function outgoingTraceParent(): string | undefined {
  const tp = getTraceContext();
  return tp ? formatTraceParent(tp) : undefined;
}

export function headersWithTrace(extra: Record<string, string> = {}): Record<string, string> {
  const tp = outgoingTraceParent();
  return tp ? { ...extra, traceparent: tp } : extra;
}

// Aliases used by app.ts / tracing.ts consumers.
export { parseTraceParent as parseTraceparent, formatTraceParent as formatTraceparent };

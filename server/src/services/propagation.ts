/**
 * propagation.ts — W3C traceparent-style context propagation.
 *
 * Self-contained (no FROZEN-module imports). Mirrors the TraceContext shape
 * from span-context.ts structurally so this module never blocks on another
 * owner's compile state. Provides parse/format/extract/inject for the
 * `traceparent` header used across agent -> agent and service hops.
 */
interface TraceContext {
  version: string;
  traceId: string;
  spanId: string;
  flags: string;
}

export function parseTraceparent(header?: string | null): TraceContext | null {
  if (!header) return null;
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(header.trim());
  if (!match) return null;
  // W3C trace-context spec requires version 00 for the current format.
  // Reject future versions to avoid misinterpreting an incompatible header.
  if (match[1]?.toLowerCase() !== '00') return null;
  const traceId = match[2];
  const spanId = match[3];
  const flags = match[4];
  if (!traceId || !spanId || !flags) return null;
  return {
    version: '00',
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    flags: flags.toLowerCase(),
  };
}

export function formatTraceparent(ctx: TraceContext): string {
  return `${ctx.version}-${ctx.traceId}-${ctx.spanId}-${ctx.flags || '01'}`;
}

export function extractTraceparent(
  headers: Record<string, string | string[] | undefined> | Headers
): TraceContext | null {
  let headerVal: string | null = null;
  if (headers instanceof Headers) {
    headerVal = headers.get('traceparent');
  } else {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'traceparent') {
        const val = headers[key];
        headerVal = Array.isArray(val) ? (val[0] ?? null) : (val ?? null);
        break;
      }
    }
  }
  return parseTraceparent(headerVal);
}

export function injectTraceparent(
  headers: Record<string, string>,
  ctx?: TraceContext
): Record<string, string> {
  if (ctx) {
    headers['traceparent'] = formatTraceparent(ctx);
  }
  return headers;
}

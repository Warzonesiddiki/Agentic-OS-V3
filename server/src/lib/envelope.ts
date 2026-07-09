/**
 * envelope.ts — consistent JSON response shape across the whole API.
 */
export interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; status?: number };
  traceId: string;
}

export function ok<T>(data: T, traceId = ''): Envelope<T> {
  return { ok: true, data, traceId };
}

export function err(code: string, message: string, traceId = '', status?: number): Envelope {
  return { ok: false, error: { code, message, status }, traceId };
}

/** Map an error condition to an HTTP status from its code prefix. */
export function statusForCode(code: string): number {
  if (code.startsWith('VALIDATION')) return 400;
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'CONFLICT') return 409;
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'SAFETY_KILL_SWITCH') return 423;
  return 500;
}

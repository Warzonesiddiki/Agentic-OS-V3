/**
 * Phase 16 — Human-readable error handler.
 * Maps raw error payloads (NexusApiError, network errors, ZodError) into a
 * consistent, user-facing structure with actionable remediation hints.
 */
import { NexusApiError } from './client.js';

export interface HumanReadableError {
  summary: string;
  code: string;
  hint: string;
  httpStatus?: number;
  requestId?: string;
  traceId?: string;
  fieldErrors?: Record<string, string>;
}

/** Remediation hints per NEXUS error code. */
const HINTS: Record<string, string> = {
  NOT_FOUND: 'The resource does not exist. Check the id/slug or create it first.',
  FORBIDDEN: 'Your token lacks the required scope or you are not the owner.',
  UNAUTHORIZED: 'Authenticate with a valid API token (Authorization: Bearer …).',
  CONFLICT: 'A resource with this identifier already exists.',
  BAD_REQUEST: 'The request body failed validation. See fieldErrors.',
  SIGNATURE_INVALID:
    'The artifact signature did not verify. Re-sign with the registered ed25519 key.',
  DEPENDENCY_CYCLE:
    'The plugin dependency graph contains a cycle. Break the loop before publishing/installing.',
  RATE_LIMITED: 'Too many requests. Back off and retry; the SDK auto-retries 429s.',
  VALIDATION_ERROR: 'Fix the listed fields and resubmit.',
  NETWORK_ERROR: 'Network failure. Check connectivity or supply a fetchImpl.',
};

export function toHumanReadableError(err: unknown): HumanReadableError {
  if (err instanceof NexusApiError) {
    return {
      summary: err.message,
      code: err.code,
      hint: HINTS[err.code] ?? 'An API error occurred. Inspect details for more information.',
      httpStatus: err.status || undefined,
      requestId: err.requestId,
      traceId: err.traceId,
      fieldErrors: extractFieldErrors(err.details),
    };
  }
  if (err && typeof err === 'object' && 'issues' in err) {
    // ZodError-like shape
    const issues =
      (err as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
    const fieldErrors: Record<string, string> = {};
    for (const i of issues) fieldErrors[i.path.join('.')] = i.message;
    return {
      summary: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      hint: HINTS.VALIDATION_ERROR ?? 'Fix the listed fields and resubmit.',
      fieldErrors,
    };
  }
  return {
    summary: err instanceof Error ? err.message : String(err),
    code: 'UNKNOWN',
    hint: 'An unexpected error occurred. Enable debug logging and retry.',
  };
}

function extractFieldErrors(details: unknown): Record<string, string> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const d = details as {
    fieldErrors?: Record<string, string>;
    issues?: Array<{ path: (string | number)[]; message: string }>;
  };
  if (d.fieldErrors) return d.fieldErrors;
  if (Array.isArray(d.issues)) {
    const out: Record<string, string> = {};
    for (const i of d.issues) out[i.path.join('.')] = i.message;
    return out;
  }
  return undefined;
}

/** Pretty-print an error for CLI/log output. */
export function formatError(err: unknown): string {
  const h = toHumanReadableError(err);
  const lines = [
    `✖ ${h.summary}`,
    `  code: ${h.code}${h.httpStatus ? ` (HTTP ${h.httpStatus})` : ''}`,
  ];
  if (h.fieldErrors && Object.keys(h.fieldErrors).length) {
    for (const [k, v] of Object.entries(h.fieldErrors)) lines.push(`  • ${k}: ${v}`);
  }
  lines.push(`  → ${h.hint}`);
  if (h.requestId) lines.push(`  requestId: ${h.requestId}`);
  if (h.traceId) lines.push(`  traceId: ${h.traceId}`);
  return lines.join('\n');
}

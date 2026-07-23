/**
 * errors.ts — Centralized error types for NEXUS 2.0
 */

/**
 * Well-known error codes mapped to their canonical HTTP status. Used as the
 * default when a caller constructs `new ApiError(code, message)` without an
 * explicit status — this keeps `throw new ApiError('NOT_FOUND', ...)` call
 * sites (of which there are dozens across services/routes) returning the
 * correct HTTP status without requiring every call site to repeat the status
 * code by hand.
 */
const DEFAULT_STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  SAFETY_KILL_SWITCH: 423,
  KILL_SWITCH_ENGAGED: 423,
  LLM_ERROR: 502,
  DATABASE_ERROR: 500,
  SANDBOX_ERROR: 500,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  public status: number;

  constructor(
    public code: string,
    message: string,
    status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} ${id} not found` : `${resource} not found`, 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super('RATE_LIMITED', 'Too many requests', 429, { retryAfter });
  }
}

export class KillSwitchError extends ApiError {
  constructor() {
    super('KILL_SWITCH_ENGAGED', 'System is in maintenance mode', 423);
  }
}

export class LLMError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('LLM_ERROR', message, 502, details);
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('DATABASE_ERROR', message, 500, details);
  }
}

export class SandboxError extends ApiError {
  constructor(message: string, details?: unknown) {
    super('SANDBOX_ERROR', message, 500, details);
  }
}

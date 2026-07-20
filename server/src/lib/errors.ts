/**
 * errors.ts — Centralized error types for NEXUS 2.0
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
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

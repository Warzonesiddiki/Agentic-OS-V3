/**
 * lib/errors.test.ts — Unit tests for ApiError.
 */
import { describe, it, expect } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';

describe('ApiError', () => {
  it('should instantiate correctly with code and message', () => {
    const error = new ApiError('NOT_FOUND', 'Asset not found');
    expect(error.message).toBe('Asset not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('should map validation error to 400', () => {
    const error = new ApiError('VALIDATION_ERROR', 'Invalid value');
    expect(error.status).toBe(400);
  });

  it('should map unauthorized to 401', () => {
    const error = new ApiError('UNAUTHORIZED', 'Invalid key');
    expect(error.status).toBe(401);
  });

  it('should map forbidden to 403', () => {
    const error = new ApiError('FORBIDDEN', 'No permission');
    expect(error.status).toBe(403);
  });

  it('should map rate limit to 429', () => {
    const error = new ApiError('RATE_LIMITED', 'Too many requests');
    expect(error.status).toBe(429);
  });

  it('should map safety kill switch to 423', () => {
    const error = new ApiError('SAFETY_KILL_SWITCH', 'Triggered');
    expect(error.status).toBe(423);
  });

  it('should map internal error to 500', () => {
    const error = new ApiError('INTERNAL_ERROR', 'DB crash');
    expect(error.status).toBe(500);
  });

  it('should be an instance of Error', () => {
    const error = new ApiError('NOT_FOUND', 'Asset not found');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });

  it('should handle empty message string', () => {
    const error = new ApiError('INTERNAL_ERROR', '');
    expect(error.message).toBe('');
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('should map CONFLICT to 409', () => {
    const error = new ApiError('CONFLICT', 'Resource conflict');
    expect(error.status).toBe(409);
  });

  it('should map PAYLOAD_TOO_LARGE to 413', () => {
    const error = new ApiError('PAYLOAD_TOO_LARGE', 'Body too large');
    expect(error.status).toBe(413);
  });

  it('should map unknown codes to 500', () => {
    const error = new ApiError('WHATEVER', 'Unknown issue');
    expect(error.status).toBe(500);
  });

  it('should be throwable and catchable with instanceof', () => {
    try {
      throw new ApiError('FORBIDDEN', 'no');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toBeInstanceOf(Error);
      expect((e as ApiError).code).toBe('FORBIDDEN');
      expect((e as ApiError).status).toBe(403);
    }
  });

  it('should preserve the stack trace', () => {
    const error = new ApiError('INTERNAL_ERROR', 'trace check');
    expect(error.stack).toBeDefined();
    expect(error.message).toBe('trace check');
    expect(error.stack).toContain('errors.test.ts');
  });
});

/**
 * envelope.test.ts — Tests for the API response envelope utilities.
 */
import { describe, it, expect } from 'vitest';
import { ok, err, statusForCode } from '../../src/lib/envelope.js';

describe('ok()', () => {
  it('returns envelope with ok=true and data', () => {
    const result = ok({ name: 'test' }, 'trace-1');
    expect(result).toEqual({
      ok: true,
      data: { name: 'test' },
      traceId: 'trace-1',
    });
  });

  it('defaults traceId to empty string', () => {
    const result = ok('hello');
    expect(result.traceId).toBe('');
  });

  it('handles null data', () => {
    const result = ok(null, 't1');
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  it('handles array data', () => {
    const result = ok([1, 2, 3], 't1');
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('handles numeric data', () => {
    const result = ok(42, 't1');
    expect(result.data).toBe(42);
  });
});

describe('err()', () => {
  it('returns envelope with ok=false and error details', () => {
    const result = err('NOT_FOUND', 'Resource not found', 'trace-2', 404);
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found', status: 404 },
      traceId: 'trace-2',
    });
  });

  it('defaults traceId to empty string', () => {
    const result = err('INTERNAL', 'Something broke');
    expect(result.traceId).toBe('');
  });

  it('handles missing status', () => {
    const result = err('INTERNAL', 'Something broke', 't1');
    expect(result.error?.status).toBeUndefined();
  });
});

describe('statusForCode()', () => {
  it('maps VALIDATION_* to 400', () => {
    expect(statusForCode('VALIDATION_ERROR')).toBe(400);
    expect(statusForCode('VALIDATION_SCHEMA')).toBe(400);
  });

  it('maps UNAUTHORIZED to 401', () => {
    expect(statusForCode('UNAUTHORIZED')).toBe(401);
  });

  it('maps FORBIDDEN to 403', () => {
    expect(statusForCode('FORBIDDEN')).toBe(403);
  });

  it('maps NOT_FOUND to 404', () => {
    expect(statusForCode('NOT_FOUND')).toBe(404);
  });

  it('maps CONFLICT to 409', () => {
    expect(statusForCode('CONFLICT')).toBe(409);
  });

  it('maps PAYLOAD_TOO_LARGE to 413', () => {
    expect(statusForCode('PAYLOAD_TOO_LARGE')).toBe(413);
  });

  it('maps RATE_LIMITED to 429', () => {
    expect(statusForCode('RATE_LIMITED')).toBe(429);
  });

  it('maps SAFETY_KILL_SWITCH to 423', () => {
    expect(statusForCode('SAFETY_KILL_SWITCH')).toBe(423);
  });

  it('maps unknown codes to 500', () => {
    expect(statusForCode('UNKNOWN_ERROR')).toBe(500);
    expect(statusForCode('SOMETHING_ELSE')).toBe(500);
  });
});

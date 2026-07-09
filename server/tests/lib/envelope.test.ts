/**
 * lib/envelope.test.ts — Unit tests for envelope utilities.
 */
import { describe, it, expect } from 'vitest';
import { ok, err, statusForCode } from '../../src/lib/envelope.js';

describe('envelope utilities', () => {
  const traceId = 'test-trace-id-123';

  it('should create a successful envelope with data', () => {
    const data = { message: 'success', id: 1 };
    const envelope = ok(data, traceId);
    expect(envelope).toEqual({
      ok: true,
      data,
      traceId,
    });
  });

  it('should create a successful envelope with array data', () => {
    const data = [1, 2, 3];
    const envelope = ok(data, traceId);
    expect(envelope).toEqual({ ok: true, data, traceId });
  });

  it('should create a successful envelope with null data', () => {
    const envelope = ok(null, traceId);
    expect(envelope).toEqual({ ok: true, data: null, traceId });
  });

  it('should create a successful envelope with string data', () => {
    const envelope = ok('plain-string', traceId);
    expect(envelope).toEqual({ ok: true, data: 'plain-string', traceId });
  });

  it('should create an error envelope with code and message', () => {
    const code = 'NOT_FOUND';
    const message = 'Resource not found';
    const envelope = err(code, message, traceId);
    expect(envelope).toEqual({
      ok: false,
      error: { code, message },
      traceId,
    });
  });

  it('should create an error envelope with status code', () => {
    const code = 'VALIDATION_ERROR';
    const message = 'Invalid input';
    const status = 400;
    const envelope = err(code, message, traceId, status);
    expect(envelope).toEqual({
      ok: false,
      error: { code, message, status },
      traceId,
    });
  });

  it('should create an error envelope for empty traceId', () => {
    const envelope = err('INTERNAL_ERROR', 'fail', '');
    expect(envelope.traceId).toBe('');
    expect(envelope.ok).toBe(false);
  });

  it('should produce distinct references per call', () => {
    const a = ok({ x: 1 }, 't1');
    const b = ok({ x: 1 }, 't1');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('should map VALIDATION codes to 400 status', () => {
    expect(statusForCode('VALIDATION_ERROR')).toBe(400);
    expect(statusForCode('VALIDATION_INVALID')).toBe(400);
    expect(statusForCode('VALIDATION_TYPE')).toBe(400);
  });

  it('should map UNAUTHORIZED code to 401 status', () => {
    expect(statusForCode('UNAUTHORIZED')).toBe(401);
  });

  it('should map FORBIDDEN code to 403 status', () => {
    expect(statusForCode('FORBIDDEN')).toBe(403);
  });

  it('should map NOT_FOUND code to 404 status', () => {
    expect(statusForCode('NOT_FOUND')).toBe(404);
  });

  it('should map CONFLICT code to 409 status', () => {
    expect(statusForCode('CONFLICT')).toBe(409);
  });

  it('should map PAYLOAD_TOO_LARGE code to 413 status', () => {
    expect(statusForCode('PAYLOAD_TOO_LARGE')).toBe(413);
  });

  it('should map RATE_LIMITED code to 429 status', () => {
    expect(statusForCode('RATE_LIMITED')).toBe(429);
  });

  it('should map SAFETY_KILL_SWITCH code to 423 status', () => {
    expect(statusForCode('SAFETY_KILL_SWITCH')).toBe(423);
  });

  it('should map unknown codes to 500 status', () => {
    expect(statusForCode('UNKNOWN_ERROR')).toBe(500);
    expect(statusForCode('CUSTOM_CODE')).toBe(500);
    expect(statusForCode('')).toBe(500);
  });
});

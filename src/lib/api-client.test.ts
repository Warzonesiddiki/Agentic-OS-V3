/**
 * Unit tests for src/lib/api-client.ts request layer.
 *
 * Focus: the timeout/abort hardening added in the previous batch, plus correct
 * auth headers and 4xx error surfacing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { request, setApiKey, ApiTimeoutError } from './api-client';

function mockFetchOnce(impl: (input: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => impl(input, init))
  ) as unknown as ReturnType<typeof vi.fn>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('api-client request — happy path + headers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the bearer token and parses an ok envelope', async () => {
    setApiKey('secret-123');
    const fetchMock = mockFetchOnce(() => jsonResponse({ ok: true, data: { id: 1 }, error: null, traceId: 't' }));
    const out = await request<{ id: number }>('/api/x');
    expect(out).toEqual({ id: 1 });
    const init = (fetchMock as unknown as (i: string, o: RequestInit) => void).mock.calls[0]![1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-123');
    setApiKey('');
  });

  it('throws on an error envelope', async () => {
    mockFetchOnce(() => jsonResponse({ ok: false, data: null, error: { code: 'X', message: 'boom' }, traceId: 't' }));
    await expect(request('/api/x')).rejects.toThrow('boom');
  });

  it('throws a plain Error on a 4xx status (non-retryable upstream)', async () => {
    mockFetchOnce(() => jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'nope' } }, 404));
    await expect(request('/api/x')).rejects.toThrow(/nope|404/);
  });
});

describe('api-client request — timeout / abort resilience', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects with ApiTimeoutError when the request exceeds the timeout budget', async () => {
    vi.useFakeTimers();
    try {
      // fetch never settles; the internal 30s AbortController should fire.
      mockFetchOnce(() => new Promise<Response>(() => {}));
      const promise = request<unknown>('/api/slow', { timeoutMs: 1000 });
      // Advance past the timeout so the AbortController aborts.
      await vi.advanceTimersByTimeAsync(1500);
      await expect(promise).rejects.toBeInstanceOf(ApiTimeoutError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects a caller-supplied AbortSignal (aborts before the timeout)', async () => {
    vi.useFakeTimers();
    try {
      mockFetchOnce(() => new Promise<Response>(() => {}));
      const controller = new AbortController();
      const promise = request<unknown>('/api/cancel', { signal: controller.signal, timeoutMs: 10_000 });
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await expect(promise).rejects.toBeInstanceOf(DOMException);
    } finally {
      vi.useRealTimers();
    }
  });
});

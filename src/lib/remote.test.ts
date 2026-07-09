/**
 * Unit tests for src/lib/remote.ts call() + v3.call().
 *
 * Verifies the retry/timeout hardening added in the previous batch:
 *   - transient (5xx / network) failures are retried with backoff, then succeed,
 *   - terminal (4xx) failures throw immediately (no retry),
 *   - a hung socket aborts via the per-attempt timeout,
 *   - a caller AbortSignal cancels the in-flight request.
 * Uses fake timers so retries/backoff resolve instantly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { call, v3, setRemote, remoteEnabled, getRemote, setApiKey } from './remote';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('remote.call — retry / transient resilience', () => {
  beforeEach(() => {
    setRemote({ mode: 'remote', baseUrl: '', apiKey: '' });
    setApiKey('');
    expect(remoteEnabled()).toBe(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setRemote({ mode: 'local' });
  });

  it('retries transient 500s with backoff and then succeeds', async () => {
    vi.useFakeTimers();
    const seq = [jsonResponse({ ok: false, error: { code: 'X', message: 'srv' } }, 503), jsonResponse({ ok: false, error: { code: 'X', message: 'srv' } }, 503), jsonResponse({ ok: true, data: { ok: 1 }, error: null, traceId: 't' }, 200)];
    let i = 0;
    const fetchMock = vi.stubGlobal(
      'fetch',
      vi.fn(async () => seq[i++] ?? jsonResponse({ ok: true, data: null, error: null, traceId: 't' }))
    );
    const promise = call<{ ok: number }>('/api/r');
    await vi.runAllTimersAsync();
    const res = await promise;
    // Two failures + one success => three fetches total.
    expect(fetchMock.mock.calls.length).toBe(3);
    expect(res.ok).toBe(true);
  });

  it('does NOT retry a terminal 404 (throws immediately)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } }, 404))
    );
    const promise = call('/api/missing');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/missing|404/);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('aborts a hung socket via the per-attempt timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {}))); // never settles
    const promise = call<unknown>('/api/hang', { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(800);
    await expect(promise).rejects.toBeDefined();
  });

  it('honors a caller AbortSignal (cancels before timeout)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})));
    const controller = new AbortController();
    const promise = call<unknown>('/api/cancel', { signal: controller.signal, timeoutMs: 10_000 });
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).rejects.toBeInstanceOf(DOMException);
  });
});

describe('remote.v3.call — envelope + timeout', () => {
  beforeEach(() => {
    setRemote({ mode: 'remote', baseUrl: '', apiKey: '' });
    expect(remoteEnabled()).toBe(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setRemote({ mode: 'local' });
  });

  it('returns the full Envelope and unwraps data via .ok', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data: { v: 42 }, error: null, traceId: 't' })));
    const promise = v3.call<{ v: number }>('/api/env');
    await vi.runAllTimersAsync();
    const env = await promise;
    expect(env.ok).toBe(true);
    expect(env.data).toEqual({ v: 42 });
  });

  it('times out a hung request instead of hanging forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})));
    const promise = v3.call<unknown>('/api/never', { timeoutMs: 400 });
    await vi.advanceTimersByTimeAsync(600);
    await expect(promise).rejects.toBeDefined();
  });
});

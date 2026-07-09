/**
 * Unit tests for src/lib/remote.ts call() + v3.call().
 *
 * Verifies the retry/timeout hardening added in the previous batch:
 *   - transient (5xx) failures are retried with backoff, then succeed,
 *   - terminal (4xx) failures throw immediately (no retry),
 *   - a hung socket aborts via the per-attempt timeout,
 *   - a caller AbortSignal cancels the in-flight request.
 *
 * Uses REAL timers (retry backoff is only ~1.5s) and a fetch stub that honors
 * the AbortSignal (rejects with AbortError on abort) so timeout/abort tests
 * settle deterministically instead of hanging.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { remote, v3, setRemote, remoteEnabled } from './remote';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A fetch stub that never resolves on its own but rejects with AbortError
 *  as soon as the supplied signal aborts (mirrors real fetch abort behavior). */
function hungFetchThatAbortsOnSignal() {
  return vi.fn(async (_input: string, init?: RequestInit) => {
    const sig = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      if (sig?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      sig?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted', 'AbortError')),
        { once: true }
      );
    });
  });
}

describe('remote.call — retry / transient resilience', () => {
  beforeEach(() => {
    setRemote({ enabled: true, baseUrl: 'http://localhost:9900', mode: 'remote', apiKey: '' });
    expect(remoteEnabled()).toBe(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setRemote({ enabled: false, baseUrl: '', mode: 'local' });
  });

  it('retries transient 500s with backoff and then succeeds', async () => {
    const seq = [
      jsonResponse({ ok: false, error: { code: 'X', message: 'srv' } }, 503),
      jsonResponse({ ok: false, error: { code: 'X', message: 'srv' } }, 503),
      jsonResponse({ ok: true, data: { ok: 1 }, error: null, traceId: 't' }, 200),
    ];
    let i = 0;
    const fetchMock = vi.fn(async () => seq[i++] ?? jsonResponse({ ok: true, data: null, error: null, traceId: 't' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await remote.call<{ ok: number }>('/api/r');
    // Two failures + one success => at least three fetches (retries happened).
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(res).toEqual({ ok: 1 });
  }, 10000);

  it('does NOT retry a terminal 404 (throws immediately)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } }, 404));
    vi.stubGlobal('fetch', fetchMock);
    await expect(remote.call('/api/missing')).rejects.toThrow(/missing|404/);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('aborts a hung socket via the per-attempt timeout', async () => {
    vi.stubGlobal('fetch', hungFetchThatAbortsOnSignal());
    await expect(remote.call<unknown>('/api/hang', { timeoutMs: 50 })).rejects.toBeInstanceOf(DOMException);
  }, 5000);

  it('honors a caller AbortSignal (cancels before timeout)', async () => {
    vi.stubGlobal('fetch', hungFetchThatAbortsOnSignal());
    const controller = new AbortController();
    const promise = remote.call<unknown>('/api/cancel', { signal: controller.signal, timeoutMs: 10_000 });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(DOMException);
  }, 5000);
});

describe('remote.v3.call — envelope + timeout', () => {
  beforeEach(() => {
    setRemote({ enabled: true, baseUrl: 'http://localhost:9900', mode: 'remote', apiKey: '' });
    expect(remoteEnabled()).toBe(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setRemote({ enabled: false, baseUrl: '', mode: 'local' });
  });

  it('returns the full Envelope and unwraps data via .ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data: { v: 42 }, error: null, traceId: 't' })));
    const env = await v3.call<{ v: number }>('/api/env');
    expect(env.ok).toBe(true);
    expect(env.data).toEqual({ v: 42 });
  });

  it('times out a hung request instead of hanging forever', async () => {
    vi.stubGlobal('fetch', hungFetchThatAbortsOnSignal());
    await expect(v3.call<unknown>('/api/never', { timeoutMs: 50 })).rejects.toBeInstanceOf(DOMException);
  }, 5000);
});

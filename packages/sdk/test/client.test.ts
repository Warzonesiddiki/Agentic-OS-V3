import { describe, it, expect, vi } from 'vitest';
import { NexusClient, NexusApiError, createClient, MarketplaceClient } from '../src/client.js';
import { verifyWebhookSignature, signWebhook, parseVerifiedWebhook } from '../src/webhooks.js';
import { toHumanReadableError, formatError } from '../src/errors.js';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('NexusClient', () => {
  it('returns the result payload on 2xx', async () => {
    const fetchImpl = mockFetch(200, { ok: true, requestId: 'r1', result: { hello: 'world' } });
    const c = new NexusClient({ baseUrl: 'http://x', fetchImpl });
    const r = await c.get<{ hello: string }>('/api/v1/ping');
    expect(r).toEqual({ hello: 'world' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/v1/ping',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('attaches bearer token and query string', async () => {
    const fetchImpl = mockFetch(200, { ok: true, requestId: 'r', result: {} });
    const c = new NexusClient({ baseUrl: 'http://x/', token: 't-123', fetchImpl });
    await c.get('/api/v1/marketplace/plugins', { limit: 5, q: 'foo' });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toContain('limit=5');
    expect(url).toContain('q=foo');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t-123');
  });

  it('throws NexusApiError with code + status on error envelope', async () => {
    const fetchImpl = mockFetch(404, {
      ok: false,
      requestId: 'r9',
      error: { code: 'NOT_FOUND', message: 'missing' },
    });
    const c = new NexusClient({ baseUrl: 'http://x', fetchImpl });
    await expect(c.get('/nope')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('retries on 429 with backoff then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 2)
        return {
          ok: false,
          status: 429,
          headers: new Map(),
          text: async () =>
            JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'slow' } }),
        };
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => JSON.stringify({ ok: true, requestId: 'r', result: { ok: true } }),
      };
    }) as unknown as typeof fetch;
    const c = new NexusClient({ baseUrl: 'http://x', fetchImpl, maxRetries: 2, backoffMs: 1 });
    const r = await c.get('/retry');
    expect(r).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('does not retry on 4xx (non-429)', async () => {
    const fetchImpl = mockFetch(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'bad' } });
    const c = new NexusClient({ baseUrl: 'http://x', fetchImpl });
    await expect(c.post('/x', {})).rejects.toBeInstanceOf(NexusApiError);
    expect((fetchImpl as any).mock.calls.length).toBe(1);
  });
});

describe('resource clients', () => {
  it('marketplace install posts to the right path', async () => {
    const fetchImpl = mockFetch(201, {
      ok: true,
      requestId: 'r',
      result: { id: 'i1', receipt: 'rc' },
    });
    const c = createClient({ baseUrl: 'http://x', fetchImpl });
    const res = await c.marketplace.install('my-plugin', { tenantId: 't' });
    expect(res.receipt).toBe('rc');
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toContain('/api/v1/marketplace/plugins/my-plugin/install');
    expect(init.method).toBe('POST');
  });
});

describe('webhooks', () => {
  it('signs and verifies a payload constant-time', () => {
    const secret = 's3cr3t';
    const payload = JSON.stringify({ event: 'plugin.published', slug: 'x' });
    const sig = signWebhook(secret, payload);
    expect(verifyWebhookSignature({ secret, payload, signature: sig })).toBe(true);
    expect(verifyWebhookSignature({ secret: 'wrong', payload, signature: sig })).toBe(false);
    const parsed = parseVerifiedWebhook<{ event: string }>({ secret, payload, signature: sig });
    expect(parsed.event).toBe('plugin.published');
  });

  it('rejects tampered payloads', () => {
    const secret = 's3cr3t';
    const payload = '{"a":1}';
    const sig = signWebhook(secret, payload);
    expect(() => parseVerifiedWebhook({ secret, payload: '{"a":2}', signature: sig })).toThrow();
  });
});

describe('human-readable errors', () => {
  it('maps NexusApiError to a hinted structure', () => {
    const h = toHumanReadableError(
      new NexusApiError({ code: 'DEPENDENCY_CYCLE', message: 'cycle', status: 409 })
    );
    expect(h.hint).toMatch(/cycle/i);
    expect(
      formatError(new NexusApiError({ code: 'NOT_FOUND', message: 'no', status: 404 }))
    ).toContain('NOT_FOUND');
  });

  it('extracts field errors from Zod-like details', () => {
    const zodish = { issues: [{ path: ['slug'], message: 'invalid' }] };
    const h = toHumanReadableError(zodish);
    expect(h.fieldErrors?.slug).toBe('invalid');
  });
});

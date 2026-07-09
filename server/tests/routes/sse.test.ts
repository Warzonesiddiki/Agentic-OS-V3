/**
 * routes/sse.test.ts — Unit tests for SSE routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  db: { query: { apiKeys: { findMany: vi.fn().mockResolvedValue([]) } } },
  isSqlite: true,
}));

vi.mock('../../src/lib/security.js', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../../src/services/sse-bus.js', () => ({
  addSSEClient: vi.fn().mockReturnValue(vi.fn()),
  getSSEClientCount: vi.fn().mockReturnValue(3),
}));

import { sse } from '../../src/routes/sse.js';

describe('SSE routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/v1/events/token should reject requests without Authorization header', async () => {
    const res = await sse.request('/api/v1/events/token', { method: 'POST' });
    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, any>;
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/events/token should reject invalid API keys', async () => {
    const { authenticate } = await import('../../src/lib/security.js');
    vi.mocked(authenticate as any).mockResolvedValue(null);

    const res = await sse.request('/api/v1/events/token', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-key' },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, any>;
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(json.error.message).toBe('Invalid API key.');
  });

  it('POST /api/v1/events/token should return a token for valid API keys', async () => {
    const { authenticate } = await import('../../src/lib/security.js');
    vi.mocked(authenticate as any).mockResolvedValue({
      id: 'p1',
      name: 'test',
      scopes: ['memory:read'],
    });

    const res = await sse.request('/api/v1/events/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-key' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.token).toBeDefined();
    expect(typeof json.data.token).toBe('string');
    expect(json.data.token.length).toBe(32); // 16 bytes hex = 32 chars
  });

  it('GET /api/v1/events/count should return SSE client count', async () => {
    const res = await sse.request('/api/v1/events/count', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.clients).toBe(3);
  });

  // SSE stream endpoint requires real HTTP infrastructure (ReadableStream with .on('close')).
  // Using Hono's test harness, the underlying Request mock doesn't implement
  // NodeJS.ReadableStream — this test validates the endpoint returns properly
  // but a full end-to-end test needs a real HTTP server.
  it.skip('GET /api/v1/events should return SSE stream with correct headers', async () => {
    const { authenticate } = await import('../../src/lib/security.js');
    vi.mocked(authenticate as any).mockResolvedValue({
      id: 'p1',
      name: 'test',
      scopes: ['memory:read'],
    });

    const tokenRes = await sse.request('/api/v1/events/token', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-key' },
    });
    const tokenJson = (await tokenRes.json()) as Record<string, any>;
    const token = tokenJson.data.token;

    const res = await sse.request(`/api/v1/events?token=${token}`, { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('GET /api/v1/events should reject expired or invalid tokens', async () => {
    const res = await sse.request('/api/v1/events?token=invalid', { method: 'GET' });
    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, any>;
    expect(json.error.code).toBe('UNAUTHORIZED');
  });
});

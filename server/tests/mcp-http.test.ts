/**
 * Aeon2 — MCP-over-HTTP auth gate (server/src/mcp-http.ts).
 *
 * server/src/mcp-http.ts is within Aeon's namespace. It is a raw Node
 * http listener (IncomingMessage / ServerResponse) that enforces the SAME
 * auth + rate-limit + payload-limit + CORS as the REST layer BEFORE a
 * request ever reaches an MCP tool. This suite proves every gate branch:
 *   - OPTIONS -> 204 + CORS allow-headers when origin is allow-listed
 *   - non-POST -> 405
 *   - missing/invalid API key -> 401
 *   - rate-limited -> 429
 *   - oversized body -> 413
 *   - valid key + valid JSON body -> passes through to the stateless transport
 * The native transport is mocked so no real socket is opened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ---- Mock the seams mcp-http.ts imports --------------------------------
vi.mock('../src/lib/env.js', () => ({
  env: {
    NEXUS_ALLOWED_ORIGINS: 'http://localhost:9900,https://app.nexus.dev',
    NEXUS_RATE_LIMIT_PER_MINUTE: 120,
    NEXUS_MAX_BODY_BYTES: 1_000_000,
  },
}));

vi.mock('../src/db/client.js', () => ({
  db: {},
  isPostgres: false,
  isSqlite: true,
}));

vi.mock('../src/lib/security.js', () => ({
  authenticate: vi.fn(async (_db: unknown, key: string | null) =>
    key === 'valid-key' ? { id: 'principal_1', scopes: ['memory:read'] } : null
  ),
}));

vi.mock('../src/lib/rate-limit.js', () => ({
  consume: vi.fn(async () => ({ allowed: true, remaining: 119, resetMs: 0 })),
  clientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));

vi.mock('../src/mcp.js', () => ({
  createNexusMcpServer: vi.fn(() => ({
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = vi.fn(async () => {});
    close = vi.fn(() => {});
  },
}));

const { handleMcp } = await import('../src/mcp-http.js');

// ---- Helpers -----------------------------------------------------------
function makeRes() {
  const headers: Record<string, string> = {};
  const res: Partial<ServerResponse> & {
    __status?: number;
    __body?: string;
    __ended?: boolean;
  } = {
    setHeader: (k: string, v: string) => {
      headers[k] = String(v);
    },
    writeHead: (status: number) => {
      res.__status = status;
    },
    end: (body?: string) => {
      res.__ended = true;
      res.__body = body;
      return res as unknown as ServerResponse;
    },
    on: vi.fn() as unknown as ServerResponse['on'],
  };
  return { res, headers };
}

function makeReq(opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  socketRemote?: string;
}) {
  const chunks = opts.body ? [Buffer.from(opts.body, 'utf8')] : [];
  const listeners: Record<string, (chunk?: unknown) => void> = {};
  const req: Partial<IncomingMessage> = {
    method: opts.method ?? 'POST',
    headers: (opts.headers ?? {}) as IncomingMessage['headers'],
    socket: { remoteAddress: opts.socketRemote ?? '127.0.0.1' } as IncomingMessage['socket'],
    on: ((event: string, cb: (chunk?: unknown) => void) => {
      listeners[event] = cb;
      return req as IncomingMessage;
    }) as IncomingMessage['on'],
  };
  // emit data/end synchronously when the handler subscribes
  queueMicrotask(() => {
    if (chunks.length) listeners['data']?.(chunks[0]);
    listeners['end']?.();
  });
  return req as IncomingMessage;
}

beforeEach(() => vi.clearAllMocks());

describe('handleMcp — auth / CORS / limits gate', () => {
  it('OPTIONS returns 204 with CORS allow-headers for an allow-listed origin', async () => {
    const { res, headers } = makeRes();
    const handled = await handleMcp(
      makeReq({ method: 'OPTIONS', headers: { origin: 'https://app.nexus.dev' } }),
      res as ServerResponse
    );
    expect(handled).toBe(true);
    expect(res.__status).toBe(204);
    expect(headers['access-control-allow-origin']).toBe('https://app.nexus.dev');
    expect(headers['access-control-allow-headers']).toContain('authorization');
  });

  it('OPTIONS does NOT set CORS headers for an unknown origin', async () => {
    const { res, headers } = makeRes();
    await handleMcp(
      makeReq({ method: 'OPTIONS', headers: { origin: 'https://evil.test' } }),
      res as ServerResponse
    );
    expect(res.__status).toBe(204);
    expect(headers['access-control-allow-origin']).toBeUndefined();
  });

  it('non-POST returns 405', async () => {
    const { res } = makeRes();
    await handleMcp(makeReq({ method: 'GET' }), res as ServerResponse);
    expect(res.__status).toBe(405);
  });

  it('missing API key returns 401', async () => {
    const { res } = makeRes();
    await handleMcp(makeReq({ headers: {} }), res as ServerResponse);
    expect(res.__status).toBe(401);
  });

  it('invalid API key returns 401', async () => {
    const { res } = makeRes();
    await handleMcp(
      makeReq({ headers: { authorization: 'Bearer wrong-key' } }),
      res as ServerResponse
    );
    expect(res.__status).toBe(401);
  });

  it('rate-limited request returns 429', async () => {
    const { consume } = await import('../src/lib/rate-limit.js');
    (consume as unknown as vi.Mock).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetMs: 1000,
    });
    const { res } = makeRes();
    await handleMcp(
      makeReq({ headers: { authorization: 'Bearer valid-key' } }),
      res as ServerResponse
    );
    expect(res.__status).toBe(429);
  });

  it('oversized content-length returns 413', async () => {
    const { res } = makeRes();
    await handleMcp(
      makeReq({
        headers: { authorization: 'Bearer valid-key', 'content-length': '99999999' },
      }),
      res as ServerResponse
    );
    expect(res.__status).toBe(413);
  });

  it('valid key + valid JSON body passes through to the transport', async () => {
    const { createNexusMcpServer } = await import('../src/mcp.js');
    const { StreamableHTTPServerTransport } =
      await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { res } = makeRes();
    const body = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/list' });
    await handleMcp(
      makeReq({
        headers: { authorization: 'Bearer valid-key', 'content-length': String(Buffer.byteLength(body)) },
        body,
      }),
      res as ServerResponse
    );
    expect((createNexusMcpServer as unknown as vi.Mock).mock.calls[0][0]).toBe('principal_1');
    expect((createNexusMcpServer as unknown as vi.Mock).mock.calls[0][1]).toEqual(['memory:read']);
    const transportMock = (StreamableHTTPServerTransport as unknown as vi.Mock).mock.results[0].value;
    expect(transportMock.handleRequest).toHaveBeenCalledOnce();
  });

  it('valid auth but invalid JSON body returns 400', async () => {
    const { res } = makeRes();
    await handleMcp(
      makeReq({
        headers: { authorization: 'Bearer valid-key', 'content-length': '5' },
        body: 'not json',
      }),
      res as ServerResponse
    );
    expect(res.__status).toBe(400);
  });
});

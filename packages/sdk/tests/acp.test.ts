/**
 * Artisan — Phase 16 SDK test.
 * ACP (Agent Communication Protocol) envelope round-trip via a mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpClient } from '../src/acp.js';

function mockFetchOnce(responseBody: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => responseBody,
    body: null,
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sampleMsg = [{ role: 'user', content: 'hi' }] as unknown[];

describe('AcpClient.call', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('sends a JSON-RPC 2.0 envelope and returns the result', async () => {
    mockFetchOnce({ jsonrpc: '2.0', result: { ok: true }, id: '1' });
    const c = new AcpClient('https://nexus.test/', 'key123');
    const res = await c.call('chat.complete', { messages: sampleMsg });
    expect(res).toEqual({ ok: true });
  });

  it('posts to the /acp endpoint with Bearer auth and correct headers', async () => {
    const fm = mockFetchOnce({ jsonrpc: '2.0', result: 1, id: '2' });
    const c = new AcpClient('https://nexus.test/', 'key123');
    await c.call('system.health');
    expect(fm).toHaveBeenCalledTimes(1);
    const arg = fm.mock.calls[0]![0] as string;
    const init = fm.mock.calls[0]![1] as RequestInit;
    expect(arg).toBe('https://nexus.test/acp');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer key123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('system.health');
    expect(typeof body.id).toBe('string');
  });

  it('normalizes a trailing slash on the base URL', async () => {
    const fm = mockFetchOnce({ jsonrpc: '2.0', result: 1, id: '3' });
    const c = new AcpClient('https://nexus.test///', 'k');
    await c.call('x');
    expect((fm.mock.calls[0]![0] as string)).toBe('https://nexus.test/acp');
  });

  it('throws when the response carries an ACP error', async () => {
    mockFetchOnce({ jsonrpc: '2.0', error: { code: -32000, message: 'boom' }, id: '4' });
    const c = new AcpClient('https://nexus.test/', 'k');
    await expect(c.call('chat.complete')).rejects.toThrow(/ACP Error \[-32000\]: boom/);
  });
});

describe('AcpClient convenience methods', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('chat() calls chat.complete with messages+options', async () => {
    const fm = mockFetchOnce({ jsonrpc: '2.0', result: 'done', id: '5' });
    const c = new AcpClient('https://n/', 'k');
    await c.chat(sampleMsg as never, { temperature: 0.2 } as never);
    const body = JSON.parse((fm.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe('chat.complete');
    expect(body.params.messages).toEqual(sampleMsg);
    expect(body.params.temperature).toBe(0.2);
  });

  it('tools() calls tools.list', async () => {
    const fm = mockFetchOnce({ jsonrpc: '2.0', result: [{ name: 't' }], id: '6' });
    const c = new AcpClient('https://n/', 'k');
    const tools = await c.tools();
    expect(tools).toEqual([{ name: 't' }]);
    expect(JSON.parse((fm.mock.calls[0]![1] as RequestInit).body as string).method).toBe('tools.list');
  });

  it('health() calls system.health', async () => {
    const fm = mockFetchOnce({ jsonrpc: '2.0', result: { status: 'ok' }, id: '7' });
    const c = new AcpClient('https://n/', 'k');
    const h = await c.health();
    expect(h).toEqual({ status: 'ok' });
    expect(JSON.parse((fm.mock.calls[0]![1] as RequestInit).body as string).method).toBe('system.health');
  });
});

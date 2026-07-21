/**
 * Aeon2 — ACP envelope round-trip (packages/sdk/src/acp.ts).
 *
 * Proves the Agent Client Protocol envelope lifecycle: request envelope
 * serialization, response envelope parsing, and a full request→response
 * round-trip through AcpClient.call (with a mocked fetch). Also locks in
 * the baseUrl trailing-slash normalization fix (AcpClient strips ALL
 * trailing slashes, so https://host/// maps to https://host/acp).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpClient, AcpRequest, AcpResponse } from '../src/acp.js';

function makeResponse(id: AcpResponse['id'], result: unknown): AcpResponse {
  return { jsonrpc: '2.0', id, result };
}

describe('AcpClient envelope round-trip', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes a request envelope via toJsonRpc', () => {
    const req: AcpRequest = { jsonrpc: '2.0', id: 'abc', method: 'tools.list', params: { a: 1 } };
    const raw = AcpClient.toJsonRpc(req);
    const parsed = JSON.parse(raw) as AcpRequest;
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe('abc');
    expect(parsed.method).toBe('tools.list');
    expect(parsed.params).toEqual({ a: 1 });
  });

  it('parses a response envelope via fromJsonRpc', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 'abc', result: { ok: true } });
    const res = AcpClient.fromJsonRpc(raw);
    expect(res.id).toBe('abc');
    expect(res.result).toEqual({ ok: true });
    expect(res.error).toBeUndefined();
  });

  it('round-trips a call: request sent, response returned', async () => {
    const sent: { url: string; body: AcpRequest } = { url: '', body: undefined as unknown as AcpRequest };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        sent.url = url;
        sent.body = JSON.parse(init.body) as AcpRequest;
        return {
          ok: true,
          json: async () => makeResponse(sent.body.id, { tools: ['a', 'b'] }),
        };
      })
    );

    const client = new AcpClient('https://host', 'key');
    const result = (await client.call('tools.list', { x: 1 })) as { tools: string[] };

    expect(sent.url).toBe('https://host/acp');
    expect(sent.body.method).toBe('tools.list');
    expect(sent.body.params).toEqual({ x: 1 });
    expect(result.tools).toEqual(['a', 'b']);
  });

  it('throws when the response carries an ACP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: { body: string }) => {
        const req = JSON.parse(init.body) as AcpRequest;
        return {
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'boom' } }),
        };
      })
    );
    const client = new AcpClient('https://host', 'key');
    await expect(client.call('chat.complete', {})).rejects.toThrow(/ACP Error/);
  });

  it('normalizes multiple trailing slashes on the base URL', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 'i', result: {} }) };
      })
    );
    // Three trailing slashes must collapse to a single /acp endpoint.
    const client = new AcpClient('https://host///', 'key');
    await client.call('system.health');
    expect(urls[0]).toBe('https://host/acp');
  });
});

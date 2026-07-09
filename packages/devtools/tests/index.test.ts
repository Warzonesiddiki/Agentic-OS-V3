/**
 * Artisan — Phase 16 DevTools smoke test.
 * Verifies DevToolsClient routes high-level commands to the ACP transport
 * (mocked via global.fetch) without a live NEXUS instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevToolsClient } from '../src/index.js';

function mockFetchOnce(result: unknown) {
  const fm = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', result, id: '1' }),
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fm);
  return fm;
}

describe('DevToolsClient', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('constructs with a default base URL and a provided key', () => {
    const c = new DevToolsClient('https://nexus.test/', 'k');
    expect(c).toBeInstanceOf(DevToolsClient);
    expect(c.baseUrl).toBe('https://nexus.test');
  });

  it('listSessions routes to a chat.complete-style ACP call', async () => {
    const fm = mockFetchOnce([{ id: 's1' }, { id: 's2' }]);
    const c = new DevToolsClient('https://nexus.test/', 'k');
    const sessions = await c.listSessions();
    expect(sessions).toEqual([{ id: 's1' }, { id: 's2' }]);
    expect(fm).toHaveBeenCalledTimes(1);
  });

  it('metrics routes to an ACP call and returns the payload', async () => {
    const fm = mockFetchOnce({ cpu: 0.3, mem: 0.6 });
    const c = new DevToolsClient('https://nexus.test/', 'k');
    const m = await c.metrics('cpu');
    expect(m).toEqual({ cpu: 0.3, mem: 0.6 });
    const body = JSON.parse((fm.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe('tools.list');
  });

  it('throws on transport error via the ACP error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', error: { code: -1, message: 'nope' }, id: '1' }),
      })) as unknown as typeof fetch
    );
    const c = new DevToolsClient('https://nexus.test/', 'k');
    await expect(c.listSessions()).rejects.toThrow(/nope/);
  });
});

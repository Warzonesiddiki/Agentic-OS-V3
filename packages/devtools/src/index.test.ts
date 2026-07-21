import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevToolsClient } from './index.js';

describe('DevToolsClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('dispatches typed administration calls through ACP', async () => {
    const requests: Array<{ url: string; method: string; params: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const request = JSON.parse(String(init.body)) as { id: string; method: string; params: unknown };
        requests.push({ url, method: request.method, params: request.params });
        return {
          json: async () => ({ jsonrpc: '2.0', id: request.id, result: { ok: true } }),
        };
      }),
    );

    const client = new DevToolsClient({ host: '127.0.0.1', port: 9900, apiKey: 'test-key' });
    await client.inspectSession('session-1');
    await client.listSessions(25);

    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:9900/acp',
        method: 'admin.session.get',
        params: { session_id: 'session-1' },
      },
      {
        url: 'http://127.0.0.1:9900/acp',
        method: 'admin.session.list',
        params: { limit: 25 },
      },
    ]);
  });
});

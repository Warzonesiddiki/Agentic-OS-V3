/**
 * services/providers/m3.test.ts — Unit tests for the M3 (aionrs-side) adapter.
 * Mocks global fetch and process.env.AIONRS_BASE_URL; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { m3Provider } from '../../../src/services/providers/m3.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const OK = {
  choices: [{ message: { content: 'm3 reply', tool_calls: [{ function: { name: 'g', arguments: '{"k":"v"}' } }] } }],
  usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 },
  model: 'm3-fast',
};

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.AIONRS_BASE_URL;
});

describe('m3Provider — metadata', () => {
  it('exposes name, capabilities and models', () => {
    expect(m3Provider.name).toBe('m3');
    expect(m3Provider.capabilities.has('vision')).toBe(true);
    expect(m3Provider.capabilities.has('tools')).toBe(true);
    expect(m3Provider.capabilities.has('1m_context')).toBe(true);
    expect(m3Provider.models).toContain('m3-reasoning');
  });
});

describe('m3Provider.invoke — happy path', () => {
  it('posts to /chat/completions with bearer key and normalizes', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);

    const res = await m3Provider.invoke(
      {
        model: 'm3-fast',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 40,
        temperature: 0.4,
        tools: [{ name: 'g', description: 'd', jsonSchema: { type: 'object' } }],
      },
      { apiKey: 'mk', baseUrl: 'http://aionr:7878/v1' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://aionr:7878/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer mk');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('m3-fast');
    expect(sent.max_tokens).toBe(40);
    expect(sent.tools[0].function.name).toBe('g');

    expect(res.provider).toBe('m3');
    expect(res.model).toBe('m3-fast');
    expect(res.text).toBe('m3 reply');
    expect(res.toolCalls).toEqual([{ name: 'g', args: { k: 'v' } }]);
    expect(res.totalTokens).toBe(6);
  });

  it('falls back to AIONRS_BASE_URL then 127.0.0.1:7878 when no baseUrl', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    process.env.AIONRS_BASE_URL = 'http://env-aionr:9999/v1';
    await m3Provider.invoke({ model: 'm3-fast', messages: [{ role: 'user', content: 'hi' }] }, {});
    expect(fetchMock.mock.calls[0][0]).toBe('http://env-aionr:9999/v1/chat/completions');
  });

  it('omits Authorization when no key', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await m3Provider.invoke({ model: 'm3-fast', messages: [{ role: 'user', content: 'hi' }] }, {});
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('m3Provider.invoke — error paths', () => {
  it('throws m3_empty_choices when no choices', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { choices: [], usage: {}, model: 'm3-fast' }));
    await expect(
      m3Provider.invoke({ model: 'm3-fast', messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('m3_empty_choices');
  });

  it('throws m3_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(502, null, 'bad gateway'));
    await expect(
      m3Provider.invoke({ model: 'm3-fast', messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('m3_502:bad gateway');
  });

  it('falls back to _raw when tool arguments invalid', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { choices: [{ message: { content: 'x', tool_calls: [{ function: { name: 'g', arguments: 'nope' } }] } }] }),
    );
    const res = await m3Provider.invoke({ model: 'm3-fast', messages: [{ role: 'user', content: 'hi' }] }, {});
    expect(res.toolCalls).toEqual([{ name: 'g', args: { _raw: 'nope' } }]);
  });
});

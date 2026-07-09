/**
 * services/unified-gateway/portkey.test.ts — Unit tests for the Portkey unified gateway.
 * Covers provider resolution, header construction, and dispatch (retry/backoff is
 * exercised by forcing a non-retried error). Mocks global fetch + lib/env.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/env.js', () => ({
  env: {},
}));

import {
  resolveProviderForModel,
  buildPortkeyHeaders,
  dispatchPortkeyRequest,
} from '../../../src/services/unified-gateway/portkey/index.js';
import { env } from '../../../src/lib/env.js';

const mockEnv = vi.mocked(env as any);

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
    body: undefined,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockEnv.PORTKEY_API_KEY = undefined;
  mockEnv.PORTKEY_BASE_URL = undefined;
});

describe('resolveProviderForModel', () => {
  const cases: Array<[string, string | undefined, string]> = [
    ['gpt-4o', undefined, 'openai'],
    ['o1-mini', undefined, 'openai'],
    ['text-embedding-3-small', undefined, 'openai'],
    ['claude-3-5-sonnet-20241022', undefined, 'anthropic'],
    ['gemini-1.5-pro', undefined, 'google'],
    ['palm-2', undefined, 'google'],
    ['llama-3.3-70b', undefined, 'groq'],
    ['mixtral-8x7b', undefined, 'groq'],
    ['gemma-7b', undefined, 'groq'],
    ['mistral-large-latest', undefined, 'mistral'],
    ['codestral-latest', undefined, 'mistral'],
    ['pixtral-12b', undefined, 'mistral'],
    ['azure-gpt-4o', undefined, 'azure-openai'],
    ['command-r-plus', undefined, 'cohere'],
    ['cohere-foo', undefined, 'cohere'],
    ['unknown-model', undefined, 'openai'],
    ['anything', 'anthropic', 'anthropic'],
  ];
  it.each(cases)('resolves %s (requested=%s) -> %s', (model, requested, expected) => {
    expect(resolveProviderForModel(model, requested)).toBe(expected);
  });
});

describe('buildPortkeyHeaders', () => {
  it('adds content-type and portkey api key from env when no config key', () => {
    mockEnv.PORTKEY_API_KEY = 'pk-env';
    const h = buildPortkeyHeaders({}, undefined);
    expect(h['Content-Type']).toBe('application/json');
    expect(h['x-portkey-api-key']).toBe('pk-env');
    expect(h['x-portkey-retry-count']).toBe('3');
    expect(h['Authorization']).toBe('Bearer pk-env');
  });

  it('prefers config.apiKey and honors provider/virtualKey/traceId/retryCount', () => {
    const h = buildPortkeyHeaders(
      {
        apiKey: 'pk-cfg',
        provider: 'anthropic',
        virtualKey: 'vk-1',
        traceId: 'trace-9',
        retryCount: 5,
      },
      undefined,
    );
    expect(h['x-portkey-api-key']).toBe('pk-cfg');
    expect(h['x-portkey-provider']).toBe('anthropic');
    expect(h['x-portkey-virtual-key']).toBe('vk-1');
    expect(h['x-portkey-trace-id']).toBe('trace-9');
    expect(h['x-portkey-retry-count']).toBe('5');
  });

  it('keeps an existing Bearer prefix on the auth key', () => {
    const h = buildPortkeyHeaders({ apiKey: 'pk' }, 'Bearer provider-key');
    expect(h['Authorization']).toBe('Bearer provider-key');
  });

  it('merges customHeaders', () => {
    const h = buildPortkeyHeaders({ customHeaders: { 'X-Foo': 'bar' } }, undefined);
    expect(h['X-Foo']).toBe('bar');
  });
});

describe('dispatchPortkeyRequest', () => {
  const baseReq = {
    model: 'gpt-4o',
    messages: [{ role: 'user' as const, content: 'hi' }],
  };

  it('dispatches to chat/completions, resolves provider, normalizes response', async () => {
    const fetchMock = makeFetch(200, {
      choices: [{ message: { content: 'portkey hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      model: 'gpt-4o',
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await dispatchPortkeyRequest(
      { ...baseReq, maxTokens: 32, temperature: 0.5 },
      { apiKey: 'pk' },
      undefined,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers['x-portkey-provider']).toBe('openai');
    const sent = JSON.parse(init.body as string);
    expect(sent.max_tokens).toBe(32);
    expect(sent.temperature).toBe(0.5);

    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o');
    expect(res.text).toBe('portkey hi');
    expect(res.totalTokens).toBe(3);
  });

  it('parses tool calls from the gateway response', async () => {
    const fetchMock = makeFetch(200, {
      choices: [{ message: { content: 'x', tool_calls: [{ function: { name: 't', arguments: '{"z":1}' } }] } }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await dispatchPortkeyRequest({ ...baseReq }, { apiKey: 'pk' }, undefined);
    expect(res.toolCalls).toEqual([{ name: 't', args: { z: 1 } }]);
  });

  it('throws portkey_<provider>_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(429, null, 'rate'));
    await expect(dispatchPortkeyRequest({ ...baseReq }, { apiKey: 'pk' }, undefined)).rejects.toThrow(
      'portkey_openai_429: rate',
    );
  });

  it('throws portkey_<provider>_empty_choices when no choices', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { choices: [] }));
    await expect(dispatchPortkeyRequest({ ...baseReq }, { apiKey: 'pk' }, undefined)).rejects.toThrow(
      'portkey_openai_empty_choices',
    );
  });

  it('attaches the provider api key as Bearer when supplied', async () => {
    const fetchMock = makeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    vi.stubGlobal('fetch', fetchMock);
    await dispatchPortkeyRequest({ ...baseReq }, { apiKey: 'pk' }, 'provider-secret');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer provider-secret');
  });

  it('resolves provider from requested provider overriding model guess', async () => {
    const fetchMock = makeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    vi.stubGlobal('fetch', fetchMock);
    await dispatchPortkeyRequest(
      { ...baseReq, provider: 'anthropic' },
      { apiKey: 'pk' },
      undefined,
    );
    expect(fetchMock.mock.calls[0][1].headers['x-portkey-provider']).toBe('anthropic');
  });
});

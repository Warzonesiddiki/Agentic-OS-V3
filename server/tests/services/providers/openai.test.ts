/**
 * services/providers/openai.test.ts — Unit tests for the OpenAI provider adapter.
 *
 * Strategy: mock the global `fetch` so the adapter is exercised against a
 * deterministic chat/completions payload. No network, no SDK, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { openaiProvider } from '../../../src/services/providers/openai.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const TOOL_CHOICE = {
  choices: [
    {
      message: {
        content: 'The answer is 42.',
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{"city":"Berlin"}' } },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
  model: 'gpt-4o',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('openaiProvider — metadata', () => {
  it('exposes correct name, capabilities and model list', () => {
    expect(openaiProvider.name).toBe('openai');
    expect(openaiProvider.capabilities.has('vision')).toBe(true);
    expect(openaiProvider.capabilities.has('tools')).toBe(true);
    expect(openaiProvider.capabilities.has('json_mode')).toBe(true);
    expect(openaiProvider.models).toContain('gpt-4o');
  });
});

describe('openaiProvider.invoke — happy path', () => {
  it('posts to the default base URL and returns a normalized response', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);

    const res = await openaiProvider.invoke(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        maxTokens: 256,
        temperature: 0.7,
      },
      { apiKey: 'sk-test' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('gpt-4o');
    expect(sent.max_tokens).toBe(256);
    expect(sent.temperature).toBe(0.7);
    expect(sent.stream).toBe(false);

    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o');
    expect(res.text).toBe('The answer is 42.');
    expect(res.promptTokens).toBe(11);
    expect(res.completionTokens).toBe(22);
    expect(res.totalTokens).toBe(33);
    expect(typeof res.durationMs).toBe('number');
  });

  it('parses tool calls and arguments and sends tool definitions on the wire', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);
    const res = await openaiProvider.invoke(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'weather' }],
        tools: [
          { name: 'get_weather', description: 'Get weather', jsonSchema: { type: 'object' } as any },
        ],
      },
      { apiKey: 'sk-test' },
    );
    expect(res.toolCalls).toEqual([{ name: 'get_weather', args: { city: 'Berlin' } }]);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.tools[0].function.name).toBe('get_weather');
    expect(sent.tools[0].function.description).toBe('Get weather');
  });

  it('falls back to the default model when none is supplied', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);
    await openaiProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-test' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.model).toBe('gpt-4o');
  });

  it('uses a custom base URL when provided', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);
    await openaiProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-test', baseUrl: 'https://proxy.local/v1' },
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.local/v1/chat/completions');
  });

  it('relays stop sequences and a supplied temperature', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);
    await openaiProvider.invoke(
      {
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.3,
        stopSequences: ['STOP'],
      },
      { apiKey: 'sk-test' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.temperature).toBe(0.3);
    expect(sent.stop).toEqual(['STOP']);
  });

  it('omits temperature/stop when not provided', async () => {
    const fetchMock = makeFetch(200, TOOL_CHOICE);
    vi.stubGlobal('fetch', fetchMock);
    await openaiProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-test' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.temperature).toBeUndefined();
    expect(sent.stop).toBeUndefined();
  });
});

describe('openaiProvider.invoke — error paths', () => {
  it('throws openai_missing_api_key when no key is supplied', async () => {
    await expect(
      openaiProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('openai_missing_api_key');
  });

  it('throws an openai_<status> error when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', makeFetch(429, null, 'rate limited'));
    await expect(
      openaiProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'sk-test' }),
    ).rejects.toThrow('openai_429:rate limited');
  });

  it('throws openai_empty_choices when the response has no choices', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'gpt-4o' }),
    );
    await expect(
      openaiProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'sk-test' }),
    ).rejects.toThrow('openai_empty_choices');
  });

  it('defaults token counts to 0 when usage is absent', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { choices: [{ message: { content: 'ok' } }], model: 'gpt-4o' }),
    );
    const res = await openaiProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-test' },
    );
    expect(res.promptTokens).toBe(0);
    expect(res.completionTokens).toBe(0);
    expect(res.totalTokens).toBe(0);
    expect(res.text).toBe('ok');
  });

  it('falls back to _raw when tool call arguments are not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, {
        choices: [
          { message: { content: 'x', tool_calls: [{ function: { name: 'f', arguments: 'not-json' } }] } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'gpt-4o',
      }),
    );
    const res = await openaiProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-test' },
    );
    expect(res.toolCalls).toEqual([{ name: 'f', args: { _raw: 'not-json' } }]);
  });
});

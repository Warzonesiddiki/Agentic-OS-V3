/**
 * services/providers/anthropic.test.ts — Unit tests for the Anthropic Messages adapter.
 * Mocks global fetch; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { anthropicProvider } from '../../../src/services/providers/anthropic.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const OK = {
  content: [
    { type: 'text', text: 'Hello from Claude.' },
    { type: 'tool_use', name: 'search', input: { q: 'weather' } },
  ],
  usage: { input_tokens: 9, output_tokens: 13 },
  model: 'claude-3-5-sonnet-20241022',
};

beforeEach(() => vi.restoreAllMocks());

describe('anthropicProvider — metadata', () => {
  it('exposes name and capabilities', () => {
    expect(anthropicProvider.name).toBe('anthropic');
    expect(anthropicProvider.capabilities.has('vision')).toBe(true);
    expect(anthropicProvider.capabilities.has('tools')).toBe(true);
    expect(anthropicProvider.models[0]).toContain('claude-3-5-sonnet');
  });
});

describe('anthropicProvider.invoke — happy path', () => {
  it('posts to /v1/messages with x-api-key + version headers and normalizes', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);

    const res = await anthropicProvider.invoke(
      {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
        maxTokens: 512,
        temperature: 0.5,
      },
      { apiKey: 'sk-ant' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-ant');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('claude-3-5-sonnet-20241022');
    expect(sent.max_tokens).toBe(512);
    expect(sent.temperature).toBe(0.5);
    expect(sent.system).toBe('You are helpful.');
    expect(sent.messages).toEqual([{ role: 'user', content: 'Hi' }]);

    expect(res.provider).toBe('anthropic');
    expect(res.model).toBe('claude-3-5-sonnet-20241022');
    expect(res.text).toBe('Hello from Claude.');
    expect(res.toolCalls).toEqual([{ name: 'search', args: { q: 'weather' } }]);
    expect(res.promptTokens).toBe(9);
    expect(res.completionTokens).toBe(13);
    expect(res.totalTokens).toBe(22);
  });

  it('maps tool definitions to input_schema and forwards stop_sequences', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await anthropicProvider.invoke(
      {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'go' }],
        tools: [{ name: 't', description: 'd', jsonSchema: { type: 'object' } }],
        stopSequences: ['STOP'],
      },
      { apiKey: 'sk-ant' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.tools[0]).toEqual({ name: 't', description: 'd', input_schema: { type: 'object' } });
    expect(sent.stop_sequences).toEqual(['STOP']);
  });

  it('uses a custom base URL when provided', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await anthropicProvider.invoke(
      { model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-ant', baseUrl: 'https://proxy.local' },
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.local/v1/messages');
  });

  it('falls back to the default model when none supplied', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await anthropicProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-ant' },
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toContain('claude-3-5-sonnet');
  });
});

describe('anthropicProvider.invoke — error paths', () => {
  it('throws anthropic_missing_api_key when no key', async () => {
    await expect(
      anthropicProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('anthropic_missing_api_key');
  });

  it('throws anthropic_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(529, null, 'overloaded'));
    await expect(
      anthropicProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'sk-ant' }),
    ).rejects.toThrow('anthropic_529:overloaded');
  });

  it('defaults token counts to 0 when usage is absent', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { content: [{ type: 'text', text: 'ok' }], model: 'claude-x' }));
    const res = await anthropicProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'sk-ant' },
    );
    expect(res.promptTokens).toBe(0);
    expect(res.completionTokens).toBe(0);
    expect(res.text).toBe('ok');
  });
});

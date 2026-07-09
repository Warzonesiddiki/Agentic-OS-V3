/**
 * services/providers/vllm.test.ts — Unit tests for the vLLM (OpenAI-compatible) adapter.
 * Mocks global fetch; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vllmProvider } from '../../../src/services/providers/vllm.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const OK = {
  choices: [{ message: { content: 'vllm says hi', tool_calls: [{ function: { name: 'f', arguments: '{"a":1}' } }] } }],
  usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
  model: 'meta-llama/Llama-3.1-8B-Instruct',
};

beforeEach(() => vi.restoreAllMocks());

describe('vllmProvider — metadata', () => {
  it('exposes name, capabilities and models', () => {
    expect(vllmProvider.name).toBe('vllm');
    expect(vllmProvider.capabilities.has('tools')).toBe(true);
    expect(vllmProvider.capabilities.has('json_mode')).toBe(true);
    expect(vllmProvider.models[0]).toContain('Llama-3.1');
  });
});

describe('vllmProvider.invoke — happy path', () => {
  it('posts to /chat/completions with bearer key and normalizes', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);

    const res = await vllmProvider.invoke(
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 50,
        temperature: 0.6,
        tools: [{ name: 'f', description: 'd', jsonSchema: { type: 'object' } }],
      },
      { apiKey: 'vk', baseUrl: 'http://vllm:8000/v1' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://vllm:8000/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer vk');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('meta-llama/Llama-3.1-8B-Instruct');
    expect(sent.max_tokens).toBe(50);
    expect(sent.temperature).toBe(0.6);
    expect(sent.tools[0].function.name).toBe('f');

    expect(res.provider).toBe('vllm');
    expect(res.model).toBe('meta-llama/Llama-3.1-8B-Instruct');
    expect(res.text).toBe('vllm says hi');
    expect(res.toolCalls).toEqual([{ name: 'f', args: { a: 1 } }]);
    expect(res.totalTokens).toBe(8);
  });

  it('omits Authorization and stop when not provided', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await vllmProvider.invoke(
      { model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    const sent = JSON.parse(init.body as string);
    expect(sent.stop).toBeUndefined();
  });

  it('defaults to 127.0.0.1:8000/v1 base URL', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await vllmProvider.invoke(
      { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/v1/chat/completions');
  });
});

describe('vllmProvider.invoke — error paths', () => {
  it('throws vllm_empty_choices when no choices returned', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { choices: [], usage: {}, model: 'x' }));
    await expect(
      vllmProvider.invoke({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('vllm_empty_choices');
  });

  it('throws vllm_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(503, null, 'unavailable'));
    await expect(
      vllmProvider.invoke({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('vllm_503:unavailable');
  });

  it('falls back to _raw when tool arguments are invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { choices: [{ message: { content: 'x', tool_calls: [{ function: { name: 'f', arguments: 'bad' } }] } }] }),
    );
    const res = await vllmProvider.invoke(
      { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    expect(res.toolCalls).toEqual([{ name: 'f', args: { _raw: 'bad' } }]);
  });
});

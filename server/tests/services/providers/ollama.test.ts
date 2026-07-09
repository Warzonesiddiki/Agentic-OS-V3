/**
 * services/providers/ollama.test.ts — Unit tests for the Ollama (native /api/chat) adapter.
 * Mocks global fetch; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ollamaProvider } from '../../../src/services/providers/ollama.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const OK = {
  message: { content: 'local reply', role: 'assistant' },
  model: 'llama3.1',
  prompt_eval_count: 7,
  eval_count: 11,
  total_duration: 1_500_000_000,
};

beforeEach(() => vi.restoreAllMocks());

describe('ollamaProvider — metadata', () => {
  it('exposes name, capabilities and model list', () => {
    expect(ollamaProvider.name).toBe('ollama');
    expect(ollamaProvider.capabilities.has('json_mode')).toBe(true);
    expect(ollamaProvider.models).toContain('llama3.1');
  });
});

describe('ollamaProvider.invoke — happy path', () => {
  it('posts to /api/chat with native body and normalizes', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);

    const res = await ollamaProvider.invoke(
      {
        model: 'llama3.1',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 64,
        temperature: 0.2,
        stopSequences: ['STOP'],
      },
      { baseUrl: 'http://ollama:11434' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama:11434/api/chat');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('llama3.1');
    expect(sent.stream).toBe(false);
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sent.options).toEqual({ temperature: 0.2, num_predict: 64, stop: ['STOP'] });

    expect(res.provider).toBe('ollama');
    expect(res.model).toBe('llama3.1');
    expect(res.text).toBe('local reply');
    expect(res.promptTokens).toBe(7);
    expect(res.completionTokens).toBe(11);
    expect(res.totalTokens).toBe(18);
    // 1.5e9 ns -> 1500 ms
    expect(res.durationMs).toBe(1500);
  });

  it('defaults to 127.0.0.1:11434 when no base URL given', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await ollamaProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('falls back to default model and computes duration from Date.now when total_duration absent', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch(200, { message: { content: 'ok' }, model: 'llama3.2' }),
    );
    const res = await ollamaProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    expect(res.model).toBe('llama3.2');
    expect(typeof res.durationMs).toBe('number');
    expect(res.totalTokens).toBe(0);
  });
});

describe('ollamaProvider.invoke — error paths', () => {
  it('throws ollama_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(404, null, 'not found'));
    await expect(
      ollamaProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('ollama_404:not found');
  });

  it('defaults token counts to 0 when counts absent', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { message: { content: 'ok' }, model: 'm' }));
    const res = await ollamaProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    expect(res.promptTokens).toBe(0);
    expect(res.completionTokens).toBe(0);
    expect(res.text).toBe('ok');
  });
});

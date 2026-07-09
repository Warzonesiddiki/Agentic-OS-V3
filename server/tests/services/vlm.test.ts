/**
 * services/vlm.test.ts — Unit tests for the Vision-Language Model integration.
 *
 * Strategy: mock `getEnv` (lib/env) and `safeFetch` (lib/http) so the VLM
 * request/response cycle and the desktop-action parser are exercised without a
 * real provider or network. Pure — no DB, no better-sqlite3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/env.js', () => ({
  getEnv: vi.fn(() => ({})),
}));
vi.mock('../../src/lib/http.js', () => ({
  safeFetch: vi.fn(),
}));

import { vlmConfigured, callVLM, parseDesktopActions } from '../../src/services/vlm.js';
import { getEnv } from '../../src/lib/env.js';
import { safeFetch } from '../../src/lib/http.js';

const mockEnv = vi.mocked(getEnv);
const mockFetch = vi.mocked(safeFetch);

function configure() {
  mockEnv.mockReturnValue({
    NEXUS_LLM_BASE_URL: 'https://llm.local/v1',
    NEXUS_LLM_API_KEY: 'sk-vlm',
    NEXUS_LLM_MODEL: 'vision-model',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configure();
});

describe('vlmConfigured', () => {
  it('returns true when base url, key and model are all set', () => {
    expect(vlmConfigured()).toBe(true);
  });

  it('returns false when any required var is missing', () => {
    mockEnv.mockReturnValue({ NEXUS_LLM_BASE_URL: 'x' });
    expect(vlmConfigured()).toBe(false);
    mockEnv.mockReturnValue({ NEXUS_LLM_API_KEY: 'x' });
    expect(vlmConfigured()).toBe(false);
    mockEnv.mockReturnValue({ NEXUS_LLM_MODEL: 'x' });
    expect(vlmConfigured()).toBe(false);
  });
});

describe('callVLM', () => {
  it('throws when the provider is not configured', async () => {
    mockEnv.mockReturnValue({});
    await expect(callVLM({ prompt: 'p', imageBase64: 'img' })).rejects.toThrow('VLM provider not configured');
  });

  it('posts a multimodal payload and normalizes the response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        model: 'vision-model',
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        choices: [{ message: { content: 'click the button' } }],
      },
    } as any);

    const res = await callVLM({ prompt: 'where is the button?', imageBase64: 'BASE64DATA' });
    expect(res.content).toBe('click the button');
    expect(res.model).toBe('vision-model');
    expect(res.usage).toEqual({ prompt: 5, completion: 7, total: 12 });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://llm.local/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as any).Authorization).toBe('Bearer sk-vlm');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('vision-model');
    expect(sent.max_tokens).toBe(2048);
    expect(sent.temperature).toBe(0.1);
    expect(sent.messages[0].content[0]).toEqual({ type: 'text', text: 'where is the button?' });
    expect(sent.messages[0].content[1].type).toBe('image_url');
    expect(sent.messages[0].content[1].image_url.url).toBe('data:image/png;base64,BASE64DATA');
  });

  it('honours a custom maxTokens', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: { choices: [{ message: { content: 'ok' } }] } } as any);
    await callVLM({ prompt: 'p', imageBase64: 'i', maxTokens: 512 });
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sent.max_tokens).toBe(512);
  });

  it('throws a descriptive error when the response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, body: { error: 'boom' } } as any);
    await expect(callVLM({ prompt: 'p', imageBase64: 'i' })).rejects.toThrow('VLM request failed (500):');
  });

  it('defaults usage to zeros when usage is absent', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: { choices: [{ message: { content: 'ok' } }] } } as any);
    const res = await callVLM({ prompt: 'p', imageBase64: 'i' });
    expect(res.usage).toEqual({ prompt: 0, completion: 0, total: 0 });
  });
});

describe('parseDesktopActions', () => {
  it('parses JSON action lines and ignores comments/explanations', () => {
    const text = [
      '// reasoning',
      '{"action": "click", "x": 100, "y": 200}',
      '# note',
      'some explanatory text',
      '{"action": "type", "text": "hello"}',
      '{"action": "done", "summary": "finished"}',
    ].join('\n');
    const actions = parseDesktopActions(text);
    expect(actions).toEqual([
      { action: 'click', x: 100, y: 200 },
      { action: 'type', text: 'hello' },
      { action: 'done', summary: 'finished' },
    ]);
  });

  it('skips malformed JSON lines', () => {
    const text = 'not json\n{"action": "screenshot"}\nalso bad';
    const actions = parseDesktopActions(text);
    expect(actions).toEqual([{ action: 'screenshot' }]);
  });

  it('returns an empty array for blank input', () => {
    expect(parseDesktopActions('')).toEqual([]);
    expect(parseDesktopActions('   ')).toEqual([]);
  });
});

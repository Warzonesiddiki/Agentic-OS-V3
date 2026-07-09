/**
 * services/providers/google.test.ts — Unit tests for the Google Gemini adapter.
 * Mocks global fetch; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { googleProvider } from '../../../src/services/providers/google.js';

function makeFetch(status: number, json: unknown, text = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  });
}

const OK = {
  candidates: [{ content: { parts: [{ text: 'Hi from Gemini' }] } }],
  usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6, totalTokenCount: 10 },
  modelVersion: 'gemini-1.5-pro',
};

beforeEach(() => vi.restoreAllMocks());

describe('googleProvider — metadata', () => {
  it('exposes name and capabilities', () => {
    expect(googleProvider.name).toBe('google');
    expect(googleProvider.capabilities.has('vision')).toBe(true);
    expect(googleProvider.capabilities.has('tools')).toBe(true);
    expect(googleProvider.capabilities.has('1m_context')).toBe(true);
    expect(googleProvider.models[0]).toBe('gemini-1.5-pro');
  });
});

describe('googleProvider.invoke — happy path', () => {
  it('posts to generateContent with api key in query and normalizes', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);

    const res = await googleProvider.invoke(
      {
        model: 'gemini-1.5-pro',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'prev' },
        ],
        maxTokens: 128,
        temperature: 0.9,
      },
      { apiKey: 'key123' },
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=key123',
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'prev' }] },
    ]);
    expect(sent.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(sent.generationConfig.maxOutputTokens).toBe(128);
    expect(sent.generationConfig.temperature).toBe(0.9);

    expect(res.provider).toBe('google');
    expect(res.model).toBe('gemini-1.5-pro');
    expect(res.text).toBe('Hi from Gemini');
    expect(res.promptTokens).toBe(4);
    expect(res.completionTokens).toBe(6);
    expect(res.totalTokens).toBe(10);
  });

  it('omits systemInstruction and generationConfig when not provided', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await googleProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'k' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.systemInstruction).toBeUndefined();
    expect(sent.generationConfig).toBeUndefined();
  });

  it('relays stopSequences into generationConfig', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await googleProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }], stopSequences: ['STOP'] },
      { apiKey: 'k' },
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.generationConfig.stopSequences).toEqual(['STOP']);
  });

  it('uses a custom base URL when provided', async () => {
    const fetchMock = makeFetch(200, OK);
    vi.stubGlobal('fetch', fetchMock);
    await googleProvider.invoke(
      { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'k', baseUrl: 'https://g.local' },
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://g.local/v1beta/models/gemini-1.5-flash:generateContent?key=k',
    );
  });
});

describe('googleProvider.invoke — error paths', () => {
  it('throws google_missing_api_key when no key', async () => {
    await expect(
      googleProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, {}),
    ).rejects.toThrow('google_missing_api_key');
  });

  it('throws google_<status>:<text> on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetch(500, null, 'boom'));
    await expect(
      googleProvider.invoke({ messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'k' }),
    ).rejects.toThrow('google_500:boom');
  });

  it('defaults token counts and text to empty when absent', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { candidates: [{ content: { parts: [] } }] }));
    const res = await googleProvider.invoke(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'k' },
    );
    expect(res.text).toBe('');
    expect(res.totalTokens).toBe(0);
  });
});

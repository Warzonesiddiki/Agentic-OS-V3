/**
 * services/llm.test.ts — Unit tests for the LLM facade (services/llm.ts).
 * Pure: mocks lib/env, lib/http (safeFetch), lib/logging, metrics, tracing.
 * callLLMStream exercises a real ReadableStream over the mocked global fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/env.js', () => ({
  getEnv: vi.fn(() => ({})),
  llmConfigured: vi.fn(() => true),
}));
vi.mock('../../src/lib/http.js', () => ({
  safeFetch: vi.fn(),
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../src/services/metrics.js', () => ({
  llmDuration: { observe: vi.fn() },
  llmTokensTotal: { inc: vi.fn() },
}));
vi.mock('../../src/services/tracing.js', () => ({
  startLLMSpan: vi.fn(() => ({}) as any),
  recordTokenUsage: vi.fn(),
  recordSpanError: vi.fn(),
  endTracedSpan: vi.fn(async () => {}),
}));

import {
  callLLM,
  callLLMStream,
  callLLMStructured,
  distillTranscript,
  agentChat,
  extractJSON,
  llmConfigured,
} from '../../src/services/llm.js';
import { getEnv } from '../../src/lib/env.js';
import { safeFetch } from '../../src/lib/http.js';
import { llmDuration, llmTokensTotal } from '../../src/services/metrics.js';
import { recordSpanError, endTracedSpan } from '../../src/services/tracing.js';

const mockEnv = vi.mocked(getEnv as any);
const mockFetch = vi.mocked(safeFetch as any);
const mockCfg = vi.mocked(llmConfigured as any);
const mockDur = vi.mocked(llmDuration.observe);
const mockTok = vi.mocked(llmTokensTotal.inc);
const mockSpanErr = vi.mocked(recordSpanError);
const mockEnd = vi.mocked(endTracedSpan as any);

function cfg() {
  mockEnv.mockReturnValue({
    NEXUS_LLM_BASE_URL: 'https://llm.local/v1',
    NEXUS_LLM_API_KEY: 'sk-llm',
    NEXUS_LLM_MODEL: 'gpt-4o',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cfg();
  mockCfg.mockReturnValue(true);
});

describe('callLLM', () => {
  it('throws when not configured', async () => {
    mockCfg.mockReturnValue(false);
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'LLM provider not configured',
    );
  });

  it('posts to chat/completions and normalizes the response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        model: 'gpt-4o',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        choices: [{ message: { content: 'hello' } }],
      },
    });

    const res = await callLLM({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
      maxTokens: 100,
      temperature: 0.2,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://llm.local/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-llm');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('gpt-4o');
    expect(sent.max_tokens).toBe(100);
    expect(sent.temperature).toBe(0.2);

    expect(res.content).toBe('hello');
    expect(res.model).toBe('gpt-4o');
    expect(res.usage).toEqual({ prompt: 10, completion: 20, total: 30 });
    expect(mockDur).toHaveBeenCalledWith({ model: 'gpt-4o', status: 'ok' }, expect.any(Number));
    expect(mockTok).toHaveBeenCalledTimes(2);
    expect(mockEnd).toHaveBeenCalled();
  });

  it('uses env model when none supplied and defaults max_tokens/temperature', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: 'x' } }] },
    });
    await callLLM({ messages: [{ role: 'user', content: 'hi' }] });
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sent.model).toBe('gpt-4o');
    expect(sent.max_tokens).toBe(4096);
    expect(sent.temperature).toBe(0.7);
  });

  it('adds anthropic-beta header for claude models', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: { choices: [{ message: { content: 'x' } }] } });
    await callLLM({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-3-5-sonnet' });
    expect(mockFetch.mock.calls[0][1].headers['anthropic-beta']).toBe('prompt-caching-2024-07-31');
  });

  it('throws and records error on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, body: { error: 'boom' }, statusText: 'Internal' });
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'LLM request failed (500):',
    );
    expect(mockSpanErr).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();
    expect(mockDur).toHaveBeenCalledWith({ model: 'gpt-4o', status: 'error' }, expect.any(Number));
  });

  it('defaults usage + content to empty when absent', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: {} });
    const res = await callLLM({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.content).toBe('');
    expect(res.usage).toEqual({ prompt: 0, completion: 0, total: 0 });
  });
});

describe('callLLMStream', () => {
  function makeStreamResponse(chunks: string[]): Response {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    return { ok: true, status: 200, body: stream } as unknown as Response;
  }

  it('parses SSE chunks and emits deltas, returns full content + usage', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hel"},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];
    // callLLMStream uses global fetch (not safeFetch)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse(chunks)));
    (globalThis as any).performance = { now: () => 0 };

    const received: string[] = [];
    const res = await callLLMStream(
      { messages: [{ role: 'user', content: 'hi' }] },
      (c) => received.push(c.text),
    );
    expect(received.join('')).toBe('Hello');
    expect(res.content).toBe('Hello');
    expect(res.usage).toEqual({ prompt: 2, completion: 3, total: 5 });
  });

  it('throws on non-ok stream response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' } as any));
    (globalThis as any).performance = { now: () => 0 };
    await expect(
      callLLMStream({ messages: [{ role: 'user', content: 'hi' }] }, () => {}),
    ).rejects.toThrow('LLM stream request failed (503)');
  });
});

describe('callLLMStructured + extractJSON', () => {
  it('extracts JSON wrapped in a markdown code block', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('extracts the first brace-delimited JSON span', () => {
    expect(extractJSON('noise {"b":2} tail')).toBe('{"b":2}');
  });
  it('returns raw text when no JSON delimiters present', () => {
    expect(extractJSON('plain text')).toBe('plain text');
  });
  it('calls callLLM and parses the structured object', async () => {
    const structured = '{"memories":[{"kind":"fact","title":"t","content":"c","tags":[],"importance":0.5}]}';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: structured } }] },
    });
    const out = await callLLMStructured<{ memories: any[] }>('sys', 'user');
    expect(out.memories).toHaveLength(1);
  });
});

describe('distillTranscript', () => {
  it('uses the LLM path when configured and returns distilled memories', async () => {
    const structured = '{"memories":[{"kind":"fact","title":"T","content":"C","tags":["x"],"importance":0.9}]}';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: structured } }] },
    });
    const out = await distillTranscript('some transcript');
    expect(out[0].title).toBe('T');
  });

  it('falls back to the heuristic when LLM is not configured', async () => {
    mockCfg.mockReturnValue(false);
    const out = await distillTranscript('remember to always lock the door');
    expect(out.length).toBeGreaterThan(0);
    // heuristic catches "remember/remind" -> a concrete memory kind
    expect(typeof out[0].kind).toBe('string');
    expect(out[0].kind.length).toBeGreaterThan(0);
  });

  it('returns a catch-all reference memory for trivial input when not configured', async () => {
    mockCfg.mockReturnValue(false);
    mockCfg.mockReturnValue(false);
    const out = await distillTranscript('hi there how are you');
    expect(Array.isArray(out)).toBe(true);
    expect(typeof out[0].kind).toBe('string');
    expect(out[0].kind.length).toBeGreaterThan(0);
  });
});

describe('agentChat', () => {
  it('builds a system+user prompt and returns the content', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: { choices: [{ message: { content: 'answer' } }] } });
    const r = await agentChat('question?', 'context text', 'Atlas');
    expect(r).toBe('answer');
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sent.messages[0].content).toContain('You are Atlas');
    expect(sent.messages[0].content).toContain('context text');
    expect(sent.messages[1].content).toBe('question?');
  });
});

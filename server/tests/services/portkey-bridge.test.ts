/**
 * services/portkey-bridge.test.ts — Unit tests for the Portkey multi-provider bridge.
 * Pure: mocks dispatchPortkeyRequest (unified-gateway/portkey) and lib/env.
 * No DB, no network, no real streaming.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchPortkeyRequest: vi.fn(),
  createPortkeySSEResponseStream: vi.fn(() => 'FAKE_STREAM'),
  env: {} as Record<string, any>,
}));

vi.mock('../../src/lib/env.js', () => ({
  env: mocks.env,
}));
vi.mock('../../src/services/unified-gateway/portkey/index.js', () => ({
  dispatchPortkeyRequest: mocks.dispatchPortkeyRequest,
  createPortkeySSEResponseStream: mocks.createPortkeySSEResponseStream,
  getAllSupportedPortkeyModels: vi.fn(() => ['gpt-4o', 'claude-3-5-sonnet-20241022']),
  PORTKEY_SUPPORTED_MODELS: {
    openai: ['gpt-4o'],
    anthropic: ['claude-3-5-sonnet-20241022'],
    google: ['gemini-1.5-flash'],
    groq: ['llama-3.3-70b'],
    mistral: ['mistral-large-latest'],
    azure: ['azure-gpt-4o'],
  },
  resolveProviderForModel: vi.fn((m: string) => (m.includes('claude') ? 'anthropic' : 'openai')),
}));

import {
  toPortkeyRequest,
  portkeyBridge,
  portkeyOpenAIProvider,
  portkeyAnthropicProvider,
  portkeyGeminiProvider,
  portkeyGroqProvider,
  portkeyMistralProvider,
  portkeyAzureProvider,
  streamPortkeyBridge,
  dispatchMultiProvider,
} from '../../src/services/portkey-bridge.js';
import { dispatchPortkeyRequest, createPortkeySSEResponseStream } from '../../src/services/unified-gateway/portkey/index.js';
import { env } from '../../src/lib/env.js';

const mockDispatch = mocks.dispatchPortkeyRequest;
const mockStream = mocks.createPortkeySSEResponseStream;
const mockEnv = mocks.env;

function fakeResp(over: Partial<any> = {}) {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    text: 'hi',
    toolCalls: undefined,
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
    durationMs: 10,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.PORTKEY_API_KEY = undefined;
  mockEnv.PORTKEY_BASE_URL = undefined;
});

describe('toPortkeyRequest', () => {
  it('maps a ProviderRequest into a PortkeyRequest', () => {
    const pr = toPortkeyRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi', name: 'n', toolCallId: 't1' }],
      maxTokens: 100,
      temperature: 0.5,
      stopSequences: ['S'],
      stream: true,
      tools: [{ name: 'f', description: 'd', jsonSchema: {} }],
    });
    expect(pr).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi', name: 'n', toolCallId: 't1' }],
      maxTokens: 100,
      temperature: 0.5,
      stopSequences: ['S'],
      stream: true,
      tools: [{ name: 'f', description: 'd', jsonSchema: {} }],
      provider: undefined,
    });
  });

  it('applies a provider override', () => {
    expect(toPortkeyRequest({ model: 'm', messages: [] }, 'anthropic').provider).toBe('anthropic');
  });
});

describe('portkeyBridge adapter', () => {
  it('declares capabilities and supported models', () => {
    expect(portkeyBridge.name).toBe('portkey');
    expect(portkeyBridge.capabilities.has('vision')).toBe(true);
    expect(portkeyBridge.models).toEqual(['gpt-4o', 'claude-3-5-sonnet-20241022']);
  });

  it('invokes dispatchPortkeyRequest with the resolved config and normalizes', async () => {
    mockDispatch.mockResolvedValue(fakeResp({ provider: 'openai', model: 'gpt-4o' }));
    const res = await portkeyBridge.invoke(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'pk' },
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [reqArg, cfgArg] = mockDispatch.mock.calls[0];
    expect(reqArg.model).toBe('gpt-4o');
    expect(cfgArg.apiKey).toBe('pk');
    expect(cfgArg.retryCount).toBe(3);
    expect(res.provider).toBe('openai');
    expect(res.totalTokens).toBe(3);
  });

  it('falls back to env.PORTKEY_API_KEY when no opts key', async () => {
    mockEnv.PORTKEY_API_KEY = 'env-pk';
    mockDispatch.mockResolvedValue(fakeResp());
    await portkeyBridge.invoke({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }, {});
    expect(mockDispatch.mock.calls[0][1].apiKey).toBe('env-pk');
  });
});

describe('sub-adapters', () => {
  const defs: Array<[string, any, string]> = [
    ['portkeyOpenAIProvider', portkeyOpenAIProvider, 'openai'],
    ['portkeyAnthropicProvider', portkeyAnthropicProvider, 'anthropic'],
    ['portkeyGeminiProvider', portkeyGeminiProvider, 'google'],
    ['portkeyGroqProvider', portkeyGroqProvider, 'groq'],
    ['portkeyMistralProvider', portkeyMistralProvider, 'mistral'],
    ['portkeyAzureProvider', portkeyAzureProvider, 'azure-openai'],
  ];
  it.each(defs)('%s resolves to provider %s and forwards default key', async (_name, adapter, provider) => {
    mockDispatch.mockResolvedValue(fakeResp({ provider }));
    const res = await adapter.invoke(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      {},
    );
    const [reqArg, cfgArg] = mockDispatch.mock.calls[0];
    expect(cfgArg.provider).toBe(provider);
    expect(reqArg.provider).toBe(provider);
    expect(res.provider).toBe(provider);
  });

  it('portkeyOpenAIProvider uses env.OPENAI_API_KEY as the Bearer provider key', async () => {
    mockEnv.OPENAI_API_KEY = 'oa-key';
    mockDispatch.mockResolvedValue(fakeResp({ provider: 'openai' }));
    await portkeyOpenAIProvider.invoke({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, {});
    const providerKey = mockDispatch.mock.calls[0][2];
    expect(providerKey).toBe('oa-key');
  });
});

describe('streamPortkeyBridge', () => {
  it('resolves provider from model and returns the SSE stream', () => {
    const stream = streamPortkeyBridge(
      { model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'pk' },
    );
    expect(stream).toBe('FAKE_STREAM');
    expect(mockStream).toHaveBeenCalledTimes(1);
    const [reqArg, cfgArg] = mockStream.mock.calls[0];
    expect(cfgArg.provider).toBe('anthropic');
    expect(reqArg.model).toBe('claude-3-5-sonnet-20241022');
  });
});

describe('dispatchMultiProvider', () => {
  it('returns on first successful provider', async () => {
    mockDispatch
      .mockRejectedValueOnce(new Error('openai down'))
      .mockResolvedValueOnce(fakeResp({ provider: 'anthropic', model: 'claude-x' }));
    const res = await dispatchMultiProvider(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      ['openai', 'anthropic'],
    );
    expect(res.provider).toBe('anthropic');
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch.mock.calls[1][1].provider).toBe('anthropic');
  });

  it('throws after all providers fail', async () => {
    mockDispatch.mockRejectedValue(new Error('all down'));
    await expect(
      dispatchMultiProvider({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, ['openai', 'anthropic']),
    ).rejects.toThrow('all down');
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it('uses default provider order and retryCount 2', async () => {
    mockDispatch.mockResolvedValue(fakeResp({ provider: 'openai' }));
    await dispatchMultiProvider({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][1].retryCount).toBe(2);
    expect(mockDispatch.mock.calls[0][1].provider).toBe('openai');
  });
});

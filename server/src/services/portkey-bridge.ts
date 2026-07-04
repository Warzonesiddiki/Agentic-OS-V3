/**
 * server/src/services/portkey-bridge.ts
 * Unified Portkey Multi-Provider Bridge.
 * Exposes standardized dispatch and SSE streaming across OpenAI, Anthropic, Gemini, Groq, Mistral, and Azure endpoints.
 */

import type { ProviderAdapter, ProviderRequest, ProviderResponse } from './llm-gateway-v2.js';
import { env } from '../lib/env.js';
import {
  dispatchPortkeyRequest,
  createPortkeySSEResponseStream,
  streamPortkeyTokenChunks,
  getAllSupportedPortkeyModels,
  PORTKEY_SUPPORTED_MODELS,
  resolveProviderForModel,
  type PortkeyConfig,
  type PortkeyProvider,
  type PortkeyRequest,
} from './unified-gateway/portkey/index.js';

export interface PortkeyBridgeOptions {
  apiKey?: string;
  baseUrl?: string;
  provider?: PortkeyProvider | string;
  virtualKey?: string;
  retryCount?: number;
  traceId?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Converts LLM Gateway ProviderRequest to PortkeyRequest.
 */
export function toPortkeyRequest(req: ProviderRequest, providerOverride?: string): PortkeyRequest {
  return {
    model: req.model,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
      toolCallId: m.toolCallId,
    })),
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    stopSequences: req.stopSequences,
    stream: req.stream,
    tools: req.tools,
    provider: providerOverride,
  };
}

/**
 * Direct Portkey Bridge ProviderAdapter implementation for `llm-gateway-v2`.
 */
export const portkeyBridge: ProviderAdapter = {
  name: 'portkey',
  capabilities: new Set(['vision', 'tools', 'json_mode', '1m_context']),
  models: getAllSupportedPortkeyModels(),
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    const config: PortkeyConfig = {
      apiKey: opts.apiKey || env.PORTKEY_API_KEY,
      baseUrl: opts.baseUrl || env.PORTKEY_BASE_URL || void 0,
      retryCount: 3,
    };

    const portkeyReq = toPortkeyRequest(req);
    const resp = await dispatchPortkeyRequest(portkeyReq, config, opts.apiKey);

    return {
      provider: resp.provider,
      model: resp.model,
      text: resp.text,
      toolCalls: resp.toolCalls,
      promptTokens: resp.promptTokens,
      completionTokens: resp.completionTokens,
      totalTokens: resp.totalTokens,
      durationMs: resp.durationMs,
    };
  },
};

/* ─── Specific Sub-Adapters Powered by Portkey Bridge ──────────────────────── */

export const portkeyOpenAIProvider: ProviderAdapter = {
  name: 'portkey-openai',
  capabilities: new Set(['vision', 'tools', 'json_mode']),
  models: PORTKEY_SUPPORTED_MODELS.openai ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('openai', req, opts, env.OPENAI_API_KEY);
  },
};

export const portkeyAnthropicProvider: ProviderAdapter = {
  name: 'portkey-anthropic',
  capabilities: new Set(['vision', 'tools', '1m_context']),
  models: PORTKEY_SUPPORTED_MODELS.anthropic ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('anthropic', req, opts, env.ANTHROPIC_API_KEY);
  },
};

export const portkeyGeminiProvider: ProviderAdapter = {
  name: 'portkey-gemini',
  capabilities: new Set(['vision', 'tools', '1m_context']),
  models: PORTKEY_SUPPORTED_MODELS.google ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('google', req, opts, env.GOOGLE_API_KEY);
  },
};

export const portkeyGroqProvider: ProviderAdapter = {
  name: 'portkey-groq',
  capabilities: new Set(['tools', 'json_mode']),
  models: PORTKEY_SUPPORTED_MODELS.groq ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('groq', req, opts, env.GROQ_API_KEY);
  },
};

export const portkeyMistralProvider: ProviderAdapter = {
  name: 'portkey-mistral',
  capabilities: new Set(['tools', 'vision', 'json_mode']),
  models: PORTKEY_SUPPORTED_MODELS.mistral ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('mistral', req, opts, env.MISTRAL_API_KEY);
  },
};

export const portkeyAzureProvider: ProviderAdapter = {
  name: 'portkey-azure',
  capabilities: new Set(['vision', 'tools', 'json_mode']),
  models: PORTKEY_SUPPORTED_MODELS.azure ?? [],
  async invoke(
    req: ProviderRequest,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderResponse> {
    return invokeWithProvider('azure-openai', req, opts, env.AZURE_OPENAI_API_KEY);
  },
};

async function invokeWithProvider(
  provider: PortkeyProvider,
  req: ProviderRequest,
  opts: { apiKey?: string; baseUrl?: string },
  defaultProviderKey?: string
): Promise<ProviderResponse> {
  const apiKey = opts.apiKey || defaultProviderKey || env.PORTKEY_API_KEY;
  const config: PortkeyConfig = {
    provider,
    apiKey: env.PORTKEY_API_KEY || void 0,
    baseUrl: opts.baseUrl || env.PORTKEY_BASE_URL || void 0,
    retryCount: 3,
  };

  const portkeyReq = toPortkeyRequest(req, provider);
  const resp = await dispatchPortkeyRequest(portkeyReq, config, apiKey);

  return {
    provider: resp.provider,
    model: resp.model,
    text: resp.text,
    toolCalls: resp.toolCalls,
    promptTokens: resp.promptTokens,
    completionTokens: resp.completionTokens,
    totalTokens: resp.totalTokens,
    durationMs: resp.durationMs,
  };
}

/* ─── Stream & Multi-Provider Dispatch Public Utilities ───────────────────── */

/**
 * Creates an SSE ReadableStream suitable for direct return in Hono response pipelines.
 * e.g., `return c.body(streamPortkeyBridge(req, opts), 200, { 'Content-Type': 'text/event-stream' });`
 */
export function streamPortkeyBridge(
  req: ProviderRequest,
  opts: PortkeyBridgeOptions = {}
): ReadableStream<Uint8Array> {
  const provider = opts.provider || resolveProviderForModel(req.model);
  const apiKey = opts.apiKey || env.PORTKEY_API_KEY;
  const config: PortkeyConfig = {
    provider,
    apiKey: env.PORTKEY_API_KEY || void 0,
    baseUrl: opts.baseUrl || env.PORTKEY_BASE_URL || void 0,
    virtualKey: opts.virtualKey,
    retryCount: opts.retryCount ?? 3,
    traceId: opts.traceId,
    customHeaders: opts.customHeaders,
  };

  const portkeyReq = toPortkeyRequest(req, provider);
  return createPortkeySSEResponseStream(portkeyReq, config, apiKey);
}

/**
 * Standardized multi-provider fallback dispatcher.
 * Attempts execution across preferred providers in sequence if initial provider call fails.
 */
export async function dispatchMultiProvider(
  req: ProviderRequest,
  preferredProviders: PortkeyProvider[] = [
    'openai',
    'anthropic',
    'google',
    'groq',
    'mistral',
    'azure-openai',
  ]
): Promise<ProviderResponse> {
  let lastError: Error | null = null;

  for (const provider of preferredProviders) {
    try {
      const config: PortkeyConfig = {
        provider,
        apiKey: env.PORTKEY_API_KEY || void 0,
        retryCount: 2,
      };
      const portkeyReq = toPortkeyRequest(req, provider);
      const resp = await dispatchPortkeyRequest(portkeyReq, config);
      return {
        provider: resp.provider,
        model: resp.model,
        text: resp.text,
        toolCalls: resp.toolCalls,
        promptTokens: resp.promptTokens,
        completionTokens: resp.completionTokens,
        totalTokens: resp.totalTokens,
        durationMs: resp.durationMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('dispatch_multi_provider_all_failed');
}

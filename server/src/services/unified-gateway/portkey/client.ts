/**
 * server/src/services/unified-gateway/portkey/client.ts
 * Core Portkey Client handling headers, retry logic, multi-provider dispatch, and SSE token streaming.
 */

import { env } from '../../../lib/env.js';
import { log } from '../../../lib/logging.js';
import type {
  PortkeyConfig,
  PortkeyProvider,
  PortkeyRequest,
  PortkeyResponse,
  PortkeyStreamChunk,
} from './types.js';

const DEFAULT_PORTKEY_BASE_URL = 'https://api.portkey.ai/v1';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Maps model names to default provider if provider is omitted.
 * Supports 150+ LLMs across OpenAI, Anthropic, Gemini/Google, Groq, Mistral, Azure, etc.
 */
export function resolveProviderForModel(
  model: string,
  requestedProvider?: string
): PortkeyProvider {
  if (requestedProvider) return requestedProvider as PortkeyProvider;
  const m = model.toLowerCase();
  if (
    m.startsWith('gpt-') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('text-embedding-')
  ) {
    return 'openai';
  }
  if (m.startsWith('claude-')) {
    return 'anthropic';
  }
  if (m.startsWith('gemini-') || m.startsWith('palm')) {
    return 'google';
  }
  if (
    m.startsWith('llama-') ||
    m.startsWith('mixtral-') ||
    m.startsWith('gemma-') ||
    m.startsWith('groq-')
  ) {
    return 'groq';
  }
  if (m.startsWith('mistral-') || m.startsWith('codestral') || m.startsWith('pixtral')) {
    return 'mistral';
  }
  if (m.startsWith('azure-')) {
    return 'azure-openai';
  }
  if (m.startsWith('command-') || m.startsWith('cohere-')) {
    return 'cohere';
  }
  return 'openai';
}

/**
 * Builds HTTP headers with standard Portkey API key, provider routing, virtual key, and retry metadata.
 */
export function buildPortkeyHeaders(
  config: PortkeyConfig = {},
  providerApiKey?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const portkeyApiKey = config.apiKey || env.PORTKEY_API_KEY;
  if (portkeyApiKey) {
    headers['x-portkey-api-key'] = portkeyApiKey;
  }

  if (config.provider) {
    headers['x-portkey-provider'] = config.provider;
  }

  const retries = config.retryCount ?? DEFAULT_MAX_RETRIES;
  headers['x-portkey-retry-count'] = String(retries);

  if (config.virtualKey) {
    headers['x-portkey-virtual-key'] = config.virtualKey;
  }

  if (config.traceId) {
    headers['x-portkey-trace-id'] = config.traceId;
  }

  // Provider key resolution for direct authorization / Portkey gateway header
  const authKey = providerApiKey || portkeyApiKey;
  if (authKey) {
    headers['Authorization'] = authKey.startsWith('Bearer ') ? authKey : `Bearer ${authKey}`;
  }

  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * Retries fetch operations with exponential backoff and jitter.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = DEFAULT_MAX_RETRIES,
  retryStatusCodes = [429, 500, 502, 503, 504]
): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retryCount) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !retryStatusCodes.includes(response.status)) {
        return response;
      }

      if (attempt === retryCount) {
        return response;
      }

      const text = await response.text().catch(() => '');
      log.warn('portkey.fetch_retry', {
        attempt: attempt + 1,
        status: response.status,
        url,
        errorSnippet: text.slice(0, 200),
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === retryCount) {
        throw lastError;
      }
      log.warn('portkey.fetch_network_retry', {
        attempt: attempt + 1,
        url,
        error: lastError.message,
      });
    }

    attempt++;
    const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 250, 8000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError || new Error('portkey_fetch_failed');
}

/**
 * Dispatches a request through Portkey Gateway API or provider endpoint.
 */
export async function dispatchPortkeyRequest(
  req: PortkeyRequest,
  configOverrides?: PortkeyConfig,
  providerApiKey?: string
): Promise<PortkeyResponse> {
  const start = Date.now();
  const cfg: PortkeyConfig = { ...req.config, ...configOverrides };
  const provider = resolveProviderForModel(req.model, req.provider || cfg.provider);
  cfg.provider = provider;

  const baseUrl = (cfg.baseUrl || env.PORTKEY_BASE_URL || DEFAULT_PORTKEY_BASE_URL).replace(
    /\/+$/,
    ''
  );
  const headers = buildPortkeyHeaders(cfg, providerApiKey);

  const payload: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    })),
    stream: false,
  };

  if (req.maxTokens) payload.max_tokens = req.maxTokens;
  if (req.temperature !== undefined) payload.temperature = req.temperature;
  if (req.stopSequences) payload.stop = req.stopSequences;
  if (req.tools?.length) {
    payload.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.jsonSchema,
      },
    }));
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
    cfg.retryCount ?? DEFAULT_MAX_RETRIES,
    cfg.retryStatusCodes
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`portkey_${provider}_${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model?: string;
  };

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error(`portkey_${provider}_empty_choices`);
  }

  const durationMs = Date.now() - start;

  return {
    provider,
    model: data.model || req.model,
    text: choice.message.content ?? '',
    toolCalls: choice.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      args: safeParseJson(tc.function.arguments),
    })),
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
    durationMs,
    raw: data,
  };
}

/**
 * Creates an AsyncGenerator of SSE stream chunks from Portkey gateway response.
 */
export async function* streamPortkeyTokenChunks(
  req: PortkeyRequest,
  configOverrides?: PortkeyConfig,
  providerApiKey?: string
): AsyncGenerator<PortkeyStreamChunk, void, unknown> {
  const cfg: PortkeyConfig = { ...req.config, ...configOverrides };
  const provider = resolveProviderForModel(req.model, req.provider || cfg.provider);
  cfg.provider = provider;

  const baseUrl = (cfg.baseUrl || env.PORTKEY_BASE_URL || DEFAULT_PORTKEY_BASE_URL).replace(
    /\/+$/,
    ''
  );
  const headers = buildPortkeyHeaders(cfg, providerApiKey);

  const payload: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    })),
    stream: true,
  };

  if (req.maxTokens) payload.max_tokens = req.maxTokens;
  if (req.temperature !== undefined) payload.temperature = req.temperature;
  if (req.stopSequences) payload.stop = req.stopSequences;
  if (req.tools?.length) {
    payload.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.jsonSchema,
      },
    }));
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
    cfg.retryCount ?? DEFAULT_MAX_RETRIES,
    cfg.retryStatusCodes
  );

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(`portkey_stream_${provider}_${response.status}: ${errText.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          yield { delta: '', done: true };
          return;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as {
              id?: string;
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{ function: { name: string; arguments: string } }>;
                };
                finish_reason?: string;
              }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
            };

            const choice = parsed.choices?.[0];
            const deltaContent = choice?.delta?.content ?? '';
            const isDone = choice?.finish_reason != null && choice.finish_reason !== '';

            yield {
              id: parsed.id,
              delta: deltaContent,
              done: isDone,
              usage: parsed.usage
                ? {
                    promptTokens: parsed.usage.prompt_tokens,
                    completionTokens: parsed.usage.completion_tokens,
                    totalTokens: parsed.usage.total_tokens,
                  }
                : undefined,
            };
          } catch {
            // Ignore non-JSON keepalive/event lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { delta: '', done: true };
}

/**
 * Creates a ReadableStream suitable for Hono SSE response pipeline.
 */
export function createPortkeySSEResponseStream(
  req: PortkeyRequest,
  configOverrides?: PortkeyConfig,
  providerApiKey?: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const tokenGenerator = streamPortkeyTokenChunks(req, configOverrides, providerApiKey);
        for await (const chunk of tokenGenerator) {
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          if (chunk.done) {
            break;
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const errData = `data: ${JSON.stringify({ error: errMessage, done: true })}\n\n`;
        controller.enqueue(encoder.encode(errData));
        controller.close();
      }
    },
  });
}

function safeParseJson(str?: string): Record<string, unknown> {
  if (!str) return {};
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return { _raw: str };
  }
}

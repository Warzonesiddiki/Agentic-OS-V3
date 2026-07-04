/**
 * server/src/services/unified-gateway/portkey/types.ts
 * Standardized types for Portkey Multi-Provider Gateway & Unified LLM Bridge.
 */

export type PortkeyProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'gemini'
  | 'groq'
  | 'mistral'
  | 'azure-openai'
  | 'cohere'
  | 'together-ai'
  | 'ollama'
  | 'vllm'
  | 'portkey';

export interface PortkeyConfig {
  /** Portkey API Key (`x-portkey-api-key`) */
  apiKey?: string;
  /** Portkey Gateway base URL, defaults to https://api.portkey.ai/v1 */
  baseUrl?: string;
  /** Target backend provider e.g. 'openai' | 'anthropic' | 'groq' | 'mistral' | 'google' | 'azure-openai' */
  provider?: PortkeyProvider | string;
  /** Portkey Virtual Key (`x-portkey-virtual-key`) */
  virtualKey?: string;
  /** Number of retry attempts on 429/5xx status codes (`x-portkey-retry-count`) */
  retryCount?: number;
  /** Custom status codes to trigger retries */
  retryStatusCodes?: number[];
  /** Portkey Trace ID (`x-portkey-trace-id`) */
  traceId?: string;
  /** Additional custom headers to pass to the request */
  customHeaders?: Record<string, string>;
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
}

export interface PortkeyMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface PortkeyTool {
  name: string;
  description: string;
  jsonSchema: unknown;
}

export interface PortkeyRequest {
  model: string;
  messages: PortkeyMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  stream?: boolean;
  tools?: PortkeyTool[];
  provider?: PortkeyProvider | string;
  config?: PortkeyConfig;
}

export interface PortkeyResponse {
  provider: string;
  model: string;
  text: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  raw?: unknown;
}

export interface PortkeyStreamChunk {
  id?: string;
  delta: string;
  done: boolean;
  role?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

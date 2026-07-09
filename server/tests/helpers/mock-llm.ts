/**
 * tests/helpers/mock-llm.ts — Deterministic LLM provider mock for offline testing.
 *
 * Replaces the real LLM client with a fake that returns controlled responses.
 * This enables testing of LLM-dependent services without API keys or network.
 *
 * Usage:
 * ```ts
 * import { mockLlm } from './helpers/mock-llm.js';
 *
 * const llm = mockLlm({ defaultResponse: 'Hello world' });
 * const reply = await llm.chat([{ role: 'user', content: 'Hi' }]);
 * expect(reply.content).toBe('Hello world');
 * ```
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface MockLlmResponse {
  content: string;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  finishReason?: 'stop' | 'tool_calls' | 'length';
}

export interface MockLlmConfig {
  /** Default response content for simple chats */
  defaultResponse?: string;
  /** Map of prompt → response for deterministic matching */
  responseMap?: Map<string, MockLlmResponse>;
  /** Default response object */
  defaultResponseObj?: MockLlmResponse;
  /** Simulated latency in ms (default: 0) */
  latencyMs?: number;
  /** Model name reported in responses (default: 'mock-model') */
  modelName?: string;
  /** Throw an error on any request (for testing error paths) */
  shouldThrow?: Error;
  /** Callback fired on each request (for assertions) */
  onRequest?: (messages: ChatMessage[]) => void;
}

/**
 * Create a mock LLM client that implements the standard chat interface.
 */
export function mockLlm(config: MockLlmConfig = {}) {
  const {
    defaultResponse = 'Mock response',
    responseMap = new Map(),
    latencyMs = 0,
    modelName = 'mock-model',
    shouldThrow,
    onRequest,
  } = config;

  const defaultResponseObj: MockLlmResponse = config.defaultResponseObj ?? {
    content: defaultResponse,
    model: modelName,
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: 'stop',
  };

  async function chat(
    messages: ChatMessage[],
    _options?: { tools?: any[]; stream?: boolean }
  ): Promise<MockLlmResponse> {
    // Fire callback for assertions
    onRequest?.(messages);

    // Simulate latency
    if (latencyMs > 0) {
      await new Promise((r) => setTimeout(r, latencyMs));
    }

    // Check if should throw
    if (shouldThrow) {
      throw shouldThrow;
    }

    // Check response map by joining message content
    const promptKey = messages.map((m) => `${m.role}:${m.content}`).join('||');
    const mapped = responseMap.get(promptKey);
    if (mapped) return { ...mapped, model: modelName };

    return { ...defaultResponseObj };
  }

  async function chatStream(
    messages: ChatMessage[],
    options?: { tools?: any[] }
  ): Promise<AsyncIterable<string>> {
    if (shouldThrow) throw shouldThrow;

    const response = await chat(messages, options);
    return {
      [Symbol.asyncIterator]() {
        let idx = 0;
        const chunks = response.content.split(/(?<=\s)/);
        return {
          async next(): Promise<IteratorResult<string>> {
            if (idx >= chunks.length) return { done: true, value: undefined as any };
            if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs / chunks.length));
            return { done: false, value: chunks[idx++] ?? '' };
          },
        };
      },
    };
  }

  return {
    chat,
    chatStream,
    model: modelName,
    config,
    /** Reset the mock call history */
    reset() {
      callHistory.length = 0;
    },
    /** Get all requests made to this mock */
    getCallHistory() {
      return [...callHistory];
    },
  };
}

/** Global call history across all mock instances */
const callHistory: Array<{ messages: ChatMessage[]; timestamp: number }> = [];

export type MockLlmInstance = ReturnType<typeof mockLlm>;

/**
 * Create a mock LLM suite with multiple named instances.
 * Useful for testing multi-model workflows.
 */
export function mockLlmSuite(configs: Record<string, MockLlmConfig> = {}) {
  const instances = new Map<string, MockLlmInstance>();
  for (const [name, cfg] of Object.entries(configs)) {
    const wrappedCfg: MockLlmConfig = {
      ...cfg,
      onRequest(messages) {
        callHistory.push({ messages, timestamp: Date.now() });
        cfg.onRequest?.(messages);
      },
    };
    instances.set(name, mockLlm(wrappedCfg));
  }
  return {
    get(name: string): MockLlmInstance {
      const inst = instances.get(name);
      if (!inst) throw new Error(`Unknown mock LLM instance: ${name}`);
      return inst;
    },
    resetAll() {
      callHistory.length = 0;
    },
    getAllHistory() {
      return [...callHistory];
    },
  };
}

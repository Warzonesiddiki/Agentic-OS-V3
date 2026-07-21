/**
 * ACP (Agent Communication Protocol) - JSON-RPC 2.0 based
 */

import type { Message, ToolDefinition, ChatOptions, HealthStatus } from './types.js';

export interface AcpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number;
}

export interface AcpResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: AcpError;
  id?: string | number;
}

export interface AcpError {
  code: number;
  message: string;
  data?: unknown;
}

export class AcpClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  static toJsonRpc(request: AcpRequest): string {
    return JSON.stringify(request);
  }

  static fromJsonRpc(raw: string): AcpResponse {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || (value as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
      throw new Error('Invalid ACP JSON-RPC response');
    }
    return value as AcpResponse;
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const body: AcpRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: crypto.randomUUID(),
    };

    const response = await fetch(`${this.baseUrl}/acp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as AcpResponse;

    if (data.error) {
      throw new Error(`ACP Error [${data.error.code}]: ${data.error.message}`);
    }

    return data.result;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<unknown> {
    return this.call('chat.complete', { messages, ...options });
  }

  async stream(messages: Message[], options?: ChatOptions): Promise<ReadableStream> {
    const body: AcpRequest = {
      jsonrpc: '2.0',
      method: 'chat.stream',
      params: { messages, ...options, stream: true },
      id: crypto.randomUUID(),
    };

    const response = await fetch(`${this.baseUrl}/acp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.body) {
      throw new Error('No response body');
    }

    return response.body;
  }

  async tools(): Promise<ToolDefinition[]> {
    return this.call('tools.list') as Promise<ToolDefinition[]>;
  }

  async health(): Promise<HealthStatus> {
    return this.call('system.health') as Promise<HealthStatus>;
  }
}

/**
 * client.ts — Outbound A2A Client for discovering and delegating subtasks to external A2A agents.
 */

import type {
  AgentCard,
  A2ATask,
  A2ATaskPayload,
  A2AClientOptions,
  A2ATaskEvent,
} from './types.js';

export class A2AClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code: string = 'A2A_CLIENT_ERROR'
  ) {
    super(message);
    this.name = 'A2AClientError';
  }
}

export class A2AClient {
  private bearerToken?: string;
  private signatureSecret?: string;
  private timeoutMs: number;

  constructor(options?: A2AClientOptions) {
    this.bearerToken = options?.bearerToken;
    this.signatureSecret = options?.signatureSecret;
    this.timeoutMs = options?.timeoutMs || 15000;
  }

  /**
   * Discover agent capabilities via standardized /.well-known/agent.json endpoint.
   */
  async discover(baseUrl: string): Promise<AgentCard> {
    const url = this.buildUrl(baseUrl, '/.well-known/agent.json');
    return this.fetchJson<AgentCard>(url, { method: 'GET' });
  }

  /**
   * Submit a task payload to a remote A2A agent.
   */
  async submitTask(
    baseUrl: string,
    payload: A2ATaskPayload
  ): Promise<{ taskId: string; status: string; task: A2ATask }> {
    const url = this.buildUrl(baseUrl, '/api/v1/a2a/tasks');
    const response = await this.fetchJson<{ taskId: string; status: string; task: A2ATask }>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response;
  }

  /**
   * Get real-time status of a task from a remote A2A agent.
   */
  async getTaskStatus(baseUrl: string, taskId: string): Promise<A2ATask> {
    const url = this.buildUrl(baseUrl, `/api/v1/a2a/tasks/${encodeURIComponent(taskId)}`);
    return this.fetchJson<A2ATask>(url, { method: 'GET' });
  }

  /**
   * Stream task progress via Server-Sent Events (SSE) from a remote A2A agent.
   */
  async streamTaskProgress(
    baseUrl: string,
    taskId: string,
    onEvent: (event: A2ATaskEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const url = this.buildUrl(baseUrl, `/api/v1/a2a/tasks/${encodeURIComponent(taskId)}/stream`);
    const headers = this.buildHeaders();
    headers['Accept'] = 'text/event-stream';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal,
      });

      if (!response.ok) {
        throw new A2AClientError(
          `Failed to connect to SSE stream: HTTP ${response.status}`,
          response.status,
          'SSE_CONNECTION_FAILED'
        );
      }

      if (!response.body) {
        throw new A2AClientError(
          'No response body for SSE stream',
          response.status,
          'EMPTY_SSE_BODY'
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            const jsonStr = dataLine.slice(6).trim();
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr) as A2ATaskEvent;
                onEvent(parsed);
              } catch {
                // Ignore SSE parse errors for keepalives/malformed chunks
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof A2AClientError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new A2AClientError(
        `Error streaming task progress: ${msg}`,
        undefined,
        'SSE_STREAM_ERROR'
      );
    }
  }

  private buildUrl(baseUrl: string, path: string): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    return headers;
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = { ...this.buildHeaders(), ...(init.headers as Record<string, string>) };

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status} ${response.statusText}`;
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          errorMsg = body.error || body.message || errorMsg;
        } catch {
          // ignore JSON parse error for error responses
        }
        throw new A2AClientError(errorMsg, response.status, `HTTP_${response.status}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof A2AClientError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new A2AClientError(
          `A2A network request timed out after ${this.timeoutMs}ms`,
          408,
          'TIMEOUT'
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new A2AClientError(`Network error calling ${url}: ${msg}`, undefined, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
}

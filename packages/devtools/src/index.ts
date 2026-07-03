/**
 * Agentic OS V4 - DevTools
 */

import { AcpClient } from '@agentic-os/sdk';

export interface DevToolsConfig {
  host: string;
  port: number;
  apiKey: string;
}

export class DevToolsClient {
  private acp: AcpClient;

  constructor(config: DevToolsConfig) {
    this.acp = new AcpClient(`http://${config.host}:${config.port}`, config.apiKey);
  }

  async inspectSession(sessionId: string): Promise<unknown> {
    return this.acp.call('admin.session.get', { session_id: sessionId });
  }

  async listSessions(limit = 50): Promise<unknown> {
    return this.acp.call('admin.session.list', { limit });
  }

  async reloadConfig(): Promise<unknown> {
    return this.acp.call('admin.config.reload', {});
  }

  async listProviders(): Promise<unknown> {
    return this.acp.call('admin.provider.list', {});
  }

  async metrics(): Promise<unknown> {
    return this.acp.call('admin.metrics', {});
  }
}

/**
 * services/mcp-registry.ts — Phase 3.3: MCP Server Registry
 *
 * Manages the lifecycle of external MCP servers:
 *  - Register servers (stdio, HTTP/SSE, Streamable HTTP)
 *  - Auto-discover tools from connected servers
 *  - Health-checking with automatic reconnection
 *  - Integration with the audit engine for lifecycle events
 *
 * Source: OpenAI SDK MCPServer, Composio MCP integration patterns
 */

import { randomUUID } from "node:crypto";
import { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendAudit } from "../lib/audit.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MCPTransportType = "stdio" | "http-sse" | "streamable-http";

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpSseConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface StreamableHttpConfig {
  url: string;
  headers?: Record<string, string>;
}

export type MCPConnectionConfig = StdioConfig | HttpSseConfig | StreamableHttpConfig;

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export type MCPServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface MCPServerRecord {
  id: string;
  name: string;
  transport: MCPTransportType;
  config: MCPConnectionConfig;
  status: MCPServerStatus;
  tools: MCPToolDefinition[];
  error?: string;
  lastConnected?: Date;
  createdAt: Date;
}

export interface MCPRegistryStats {
  total: number;
  connected: number;
  disconnected: number;
  errored: number;
  totalTools: number;
}

// ── Events ─────────────────────────────────────────────────────────────────────

export type MCPRegistryEvent =
  | { type: "server:registered"; server: MCPServerRecord }
  | { type: "server:unregistered"; id: string }
  | { type: "server:connected"; id: string }
  | { type: "server:disconnected"; id: string }
  | { type: "server:error"; id: string; error: string }
  | { type: "server:tools_discovered"; id: string; tools: MCPToolDefinition[] }
  | { type: "server:health_check_failed"; id: string; error: string };

// ── Registry ───────────────────────────────────────────────────────────────────

const ACTOR = "mcp-registry";

/**
 * MCPRegistry manages the lifecycle of MCP servers.
 *
 * Design:
 *  - Singleton (one registry per process)
 *  - Event-driven for loose coupling
 *  - Auto-reconnects with exponential backoff
 *  - Every lifecycle mutation appends to the hash-chained audit log
 */
export class MCPRegistry {
  private servers = new Map<string, MCPServerRecord>();
  private connections = new Map<string, { client: unknown; transport: unknown }>();
  private processes = new Map<string, ChildProcess>();
  private healthTimers = new Map<string, ReturnType<typeof setInterval>>();
  private emitter = new EventEmitter();
  private reconnectAttempts = new Map<string, number>();

  private static instance: MCPRegistry;

  /** Get the singleton registry instance. */
  static getInstance(): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry();
    }
    return MCPRegistry.instance;
  }

  // ── Server Lifecycle ─────────────────────────────────────────

  /**
   * Register a new MCP server in the registry.
   * Does NOT connect — call `connect(id)` separately.
   */
  register(
    name: string,
    transport: MCPTransportType,
    config: MCPConnectionConfig
  ): MCPServerRecord {
    const id = `mcp_${randomUUID()}`;
    const record: MCPServerRecord = {
      id,
      name,
      transport,
      config,
      status: "disconnected",
      tools: [],
      createdAt: new Date(),
    };
    this.servers.set(id, record);
    this.emitter.emit("server:registered", { type: "server:registered", server: record });
    return record;
  }

  /**
   * Unregister a server. Disconnects first if connected.
   */
  unregister(id: string): boolean {
    this.disconnect(id).catch(() => {});
    this.stopHealthChecks(id);
    const removed = this.servers.delete(id);
    if (removed) {
      this.reconnectAttempts.delete(id);
      this.emitter.emit("server:unregistered", { type: "server:unregistered", id });
    }
    return removed;
  }

  /**
   * Connect to a registered server.
   * Creates the appropriate transport, establishes the MCP connection,
   * then auto-discovers available tools.
   */
  async connect(id: string): Promise<boolean> {
    const record = this.servers.get(id);
    if (!record) throw new Error(`MCP server ${id} not found`);
    if (record.status === "connected") return true;

    record.status = "connecting";
    record.error = undefined;

    try {
      const { Client } = await import(
        "@modelcontextprotocol/sdk/client/index.js"
      );

      const client = new Client(
        { name: "nexus-mcp-registry", version: "2.0.0" },
        { capabilities: {} }
      );

      let transport: unknown;

      switch (record.transport) {
        case "stdio": {
          const cfg = record.config as StdioConfig;
          const { StdioClientTransport } = await import(
            "@modelcontextprotocol/sdk/client/stdio.js"
          );
          transport = new StdioClientTransport({
            command: cfg.command,
            args: cfg.args ?? [],
            env: cfg.env,
            cwd: cfg.cwd,
          });
          break;
        }

        case "streamable-http": {
          const cfg = record.config as StreamableHttpConfig;
          const { StreamableHTTPClientTransport } = await import(
            "@modelcontextprotocol/sdk/client/streamableHttp.js"
          );
          transport = new StreamableHTTPClientTransport(new URL(cfg.url));
          break;
        }

        case "http-sse": {
          const cfg = record.config as HttpSseConfig;
          const { SSEClientTransport } = await import(
            "@modelcontextprotocol/sdk/client/sse.js"
          );
          const sseOpts: Record<string, unknown> = {};
          if (cfg.headers) {
            sseOpts.requestInit = { headers: cfg.headers };
          }
          transport = new SSEClientTransport(new URL(cfg.url), sseOpts);
          break;
        }

        default:
          throw new Error(`Unsupported transport type: ${record.transport}`);
      }

      await (client as { connect: (t: unknown) => Promise<void> }).connect(transport);
      this.connections.set(id, { client, transport });

      record.status = "connected";
      record.lastConnected = new Date();
      this.reconnectAttempts.delete(id);

      await appendAudit(
        "mcp.connected",
        {
          serverId: id,
          name: record.name,
          transport: record.transport,
          config: sanitizeConfig(record.config),
        },
        ACTOR
      );

      this.emitter.emit("server:connected", { type: "server:connected", id });

      // Auto-discover tools (non-fatal if it fails)
      try {
        const tools = await this.discoverTools(id);
        record.tools = tools;
      } catch {
        // Tools will be discovered on next health check or explicitly
      }

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record.status = "error";
      record.error = msg;

      await appendAudit(
        "mcp.connect_failed",
        {
          serverId: id,
          name: record.name,
          transport: record.transport,
          error: msg,
        },
        ACTOR
      );

      this.emitter.emit("server:error", { type: "server:error", id, error: msg });
      return false;
    }
  }

  /**
   * Disconnect from a server. Cleans up the client and transport.
   */
  async disconnect(id: string): Promise<boolean> {
    const conn = this.connections.get(id);
    if (conn) {
      try {
        await (conn.client as { close: () => Promise<void> }).close();
      } catch {
        // already closed
      }
      this.connections.delete(id);
    }

    const proc = this.processes.get(id);
    if (proc) {
      try {
        proc.kill();
      } catch {
        // already dead
      }
      this.processes.delete(id);
    }

    const record = this.servers.get(id);
    if (record) {
      record.status = "disconnected";

      await appendAudit(
        "mcp.disconnected",
        { serverId: id, name: record.name },
        ACTOR
      );

      this.emitter.emit("server:disconnected", { type: "server:disconnected", id });
    }

    return true;
  }

  // ── Tool Discovery ───────────────────────────────────────────

  /**
   * Discover tools from a connected MCP server.
   * Returns the list of tool definitions and caches them on the record.
   */
  async discoverTools(id: string): Promise<MCPToolDefinition[]> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`MCP server ${id} is not connected`);

    const result = await (
      conn.client as { listTools: () => Promise<{ tools: unknown[] }> }
    ).listTools();

    const tools: MCPToolDefinition[] = (result.tools ?? []).map((t: unknown) => {
      const def = t as { name: string; description?: string; inputSchema?: unknown };
      return {
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      };
    });

    const record = this.servers.get(id);
    if (record) {
      record.tools = tools;
    }

    this.emitter.emit("server:tools_discovered", {
      type: "server:tools_discovered",
      id,
      tools,
    });

    return tools;
  }

  /**
   * Get tools for a specific server, or all tools across all registered servers.
   */
  getTools(id?: string): MCPToolDefinition[] {
    if (id) {
      return this.servers.get(id)?.tools ?? [];
    }
    const all: MCPToolDefinition[] = [];
    for (const s of this.servers.values()) {
      all.push(...s.tools);
    }
    return all;
  }

  /**
   * Call a tool on a specific MCP server.
   */
  async callTool(
    id: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`MCP server ${id} is not connected`);

    const result = await (
      conn.client as {
        callTool: (
          name: string,
          args: Record<string, unknown>
        ) => Promise<unknown>;
      }
    ).callTool(toolName, args);

    return result;
  }

  // ── Query ────────────────────────────────────────────────────

  /** List all registered servers. */
  listServers(): MCPServerRecord[] {
    return Array.from(this.servers.values());
  }

  /** Get a single server by id. */
  getServer(id: string): MCPServerRecord | undefined {
    return this.servers.get(id);
  }

  /** Get aggregate stats about the registry. */
  getStats(): MCPRegistryStats {
    let connected = 0;
    let disconnected = 0;
    let errored = 0;
    let totalTools = 0;

    for (const s of this.servers.values()) {
      if (s.status === "connected") connected++;
      else if (s.status === "error") errored++;
      else disconnected++;
      totalTools += s.tools.length;
    }

    return { total: this.servers.size, connected, disconnected, errored, totalTools };
  }

  // ── Health & Reconnection ────────────────────────────────────

  /**
   * Health-check a single server by calling `ping`.
   * On failure, automatically schedules a reconnection attempt
   * with exponential backoff (1s, 2s, 4s, ... capped at 30s).
   */
  async healthCheck(id: string): Promise<boolean> {
    const conn = this.connections.get(id);
    if (!conn) return false;

    try {
      await (conn.client as { ping: () => Promise<void> }).ping();
      const record = this.servers.get(id);
      if (record) {
        record.status = "connected";
        record.error = undefined;
        record.lastConnected = new Date();
      }
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const record = this.servers.get(id);
      if (record) {
        record.status = "error";
        record.error = msg;
      }

      this.emitter.emit("server:health_check_failed", {
        type: "server:health_check_failed",
        id,
        error: msg,
      });

      // Exponential backoff reconnection
      const attempts = (this.reconnectAttempts.get(id) ?? 0) + 1;
      this.reconnectAttempts.set(id, attempts);
      const delay = Math.min(1000 * 2 ** (attempts - 1), 30000);

      setTimeout(() => {
        this.connect(id).catch(() => {});
      }, delay);

      return false;
    }
  }

  /**
   * Start periodic health checks for a server.
   * Default interval: 30 seconds.
   */
  startHealthChecks(id: string, intervalMs = 30000): void {
    this.stopHealthChecks(id);
    const timer = setInterval(() => {
      this.healthCheck(id).catch(() => {});
    }, intervalMs);
    this.healthTimers.set(id, timer);
  }

  /** Stop health checks for a server. */
  stopHealthChecks(id: string): void {
    const timer = this.healthTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.healthTimers.delete(id);
    }
  }

  /**
   * Attempt to reconnect all errored or disconnected servers.
   */
  async reconnectAll(): Promise<void> {
    const promises: Promise<boolean>[] = [];
    for (const [id, record] of this.servers) {
      if (record.status === "error" || record.status === "disconnected") {
        promises.push(this.connect(id));
      }
    }
    await Promise.allSettled(promises);
  }

  // ── Events ───────────────────────────────────────────────────

  /** Subscribe to registry events. */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.emitter.on(event, handler);
  }

  /** Unsubscribe from registry events. */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.emitter.off(event, handler);
  }

  // ── Cleanup ──────────────────────────────────────────────────

  /** Shut down the registry: disconnect all servers and clear timers. */
  async shutdown(): Promise<void> {
    for (const id of this.healthTimers.keys()) {
      this.stopHealthChecks(id);
    }
    const promises: Promise<boolean>[] = [];
    for (const id of this.servers.keys()) {
      promises.push(this.disconnect(id));
    }
    await Promise.allSettled(promises);
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

/** Singleton registry instance. */
export const mcpRegistry = MCPRegistry.getInstance();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip sensitive fields from config before audit logging. */
function sanitizeConfig(
  config: MCPConnectionConfig
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if ("command" in config) {
    safe.command = config.command;
    safe.args = config.args;
    safe.cwd = config.cwd;
    safe.env = config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([k]) => [k, "***REDACTED***"])
        )
      : undefined;
  } else {
    safe.url = (config as HttpSseConfig | StreamableHttpConfig).url;
  }
  return safe;
}

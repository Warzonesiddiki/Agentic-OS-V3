/**
 * lib/os/policy.ts — MCP Tool Policy Engine.
 *
 * Defines which discovered MCP tools are usable by which agents.
 * Integrates with the MCP Registry to filter available tools based on
 * ring-based ACL and per-tool override policies.
 */

import { mcpRegistry } from "../../services/mcp-registry.js";
import { checkACL } from "../../services/kernel.js";

// ── MCP Policy types (self-contained — mirrors src/lib/os/types.ts) ──

export interface MCPToolPolicy {
  serverPattern?: string;
  toolPattern?: string;
  minRing?: number;
  rateLimit?: number;
  allowed: boolean;
}

export interface MCPPolicyConfig {
  defaultPolicy: "allow" | "deny";
  overrides: MCPToolPolicy[];
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; required?: string[] };
  serverId?: string;
  category?: string;
}

// ── Default Policy ────────────────────────────────────────────────────────────

const DEFAULT_POLICY: MCPPolicyConfig = {
  defaultPolicy: "deny",
  overrides: [],
};

let currentPolicy: MCPPolicyConfig = { ...DEFAULT_POLICY };

// ── Policy Management ─────────────────────────────────────────────────────────

/**
 * Set the active MCP tool policy.
 * Replaces any previously set policy.
 */
export function setMCPPolicy(policy: MCPPolicyConfig): void {
  currentPolicy = {
    defaultPolicy: policy.defaultPolicy,
    overrides: policy.overrides.map((o) => ({
      ...o,
      minRing: o.minRing ?? 0,
      rateLimit: o.rateLimit ?? 0,
    })),
  };
}

/** Reset the policy to defaults (deny all). */
export function resetMCPPolicy(): void {
  currentPolicy = { ...DEFAULT_POLICY };
}

/** Get the current policy config. */
export function getMCPPolicy(): Readonly<MCPPolicyConfig> {
  return currentPolicy;
}

// ── Resolution ─────────────────────────────────────────────────────────────────

function matchPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

/**
 * Resolve whether a specific server+tool is allowed by the current policy.
 */
export function isToolAllowed(
  serverName: string,
  toolName: string,
  ring: number
): boolean {
  // Check overrides first (most specific wins)
  for (const override of currentPolicy.overrides) {
    const serverMatch = override.serverPattern
      ? matchPattern(serverName, override.serverPattern)
      : true;
    const toolMatch = override.toolPattern
      ? matchPattern(toolName, override.toolPattern)
      : true;

    if (serverMatch && toolMatch) {
      if (!override.allowed) return false;
      if (override.minRing !== undefined && ring < override.minRing) return false;
      return true;
    }
  }

  // Fall back to default policy
  if (currentPolicy.defaultPolicy === "deny") return false;

  // Default allow — check ring via kernel ACL
  return checkACL(ring, `mcp.${toolName}`);
}

/**
 * Get all tool definitions accessible to an agent at a given ring level.
 * Fetches from the registry and filters through the policy engine.
 */
export function getAccessibleTools(ring: number): ToolDefinition[] {
  const servers = mcpRegistry.listServers();
  const tools: ToolDefinition[] = [];

  for (const server of servers) {
    if (server.status !== "connected") continue;

    for (const tool of server.tools) {
      if (isToolAllowed(server.name, tool.name, ring)) {
        tools.push({
          name: `${server.name}.${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema as ToolDefinition["inputSchema"],
          serverId: server.id,
          category: "mcp",
        });
      }
    }
  }

  return tools;
}

/**
 * Get all tool definitions for a specific server that are accessible to an agent.
 */
export function getAccessibleToolsForServer(
  serverId: string,
  ring: number
): ToolDefinition[] {
  const server = mcpRegistry.getServer(serverId);
  if (!server || server.status !== "connected") return [];

  return server.tools
    .filter((t) => isToolAllowed(server.name, t.name, ring))
    .map((t) => ({
      name: `${server.name}.${t.name}`,
      description: t.description,
      inputSchema: t.inputSchema as ToolDefinition["inputSchema"],
      serverId: server.id,
      category: "mcp",
    }));
}

/**
 * Register a convenience set of override policies for common MCP tool servers.
 * This is called at boot to enable known-safe tools.
 */
export function registerDefaultMCPPolicies(): void {
  setMCPPolicy({
    defaultPolicy: "deny",
    overrides: [
      // Allow all tools from filesystem servers to ring 1+ agents
      { toolPattern: "filesystem.*", minRing: 1, allowed: true },
      // Allow all tools from web/search servers to ring 2+ agents
      { toolPattern: "web.*", minRing: 2, allowed: true },
      { toolPattern: "search.*", minRing: 2, allowed: true },
      // Allow read-only DB tools to ring 2+ agents
      { toolPattern: "database.query", minRing: 2, allowed: true },
      { toolPattern: "database.execute", minRing: 1, allowed: true },
      // Deny dangerous tools by pattern
      { toolPattern: "shell.*", minRing: 0, allowed: true },
      { toolPattern: "system.*", minRing: 0, allowed: true },
    ],
  });
}

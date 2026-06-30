/**
 * os/policy.ts — access control: tool registry, execution rings, risk
 * classification, and approval decisions. Pure decision logic — no I/O.
 * Reused by the kernel, the CLI/hooks console, and the safety benchmark.
 */
import type { Ring, RiskLevel, ToolSpec } from "./types";

export const TOOL_REGISTRY: ToolSpec[] = [
  { name: "memory.recall", description: "Token-budgeted recall", provider: "builtin", scopesRequired: ["memory:read"], riskLevel: "read", minRing: 1, timeoutMs: 5000, retryable: true, approvalRequired: false },
  { name: "memory.write", description: "Store a memory", provider: "builtin", scopesRequired: ["memory:write"], riskLevel: "write", minRing: 1, timeoutMs: 5000, retryable: true, approvalRequired: false },
  { name: "memory.delete", description: "Delete a memory", provider: "builtin", scopesRequired: ["memory:write"], riskLevel: "destructive", minRing: 1, timeoutMs: 5000, retryable: false, approvalRequired: true },
  { name: "shell", description: "Execute a shell command", provider: "cli", scopesRequired: ["tool:invoke"], riskLevel: "privileged", minRing: 1, timeoutMs: 30000, retryable: false, approvalRequired: false },
  { name: "fs.read", description: "Read a project file", provider: "builtin", scopesRequired: ["memory:read"], riskLevel: "read", minRing: 1, timeoutMs: 3000, retryable: true, approvalRequired: false },
  { name: "fs.write", description: "Write a project file", provider: "builtin", scopesRequired: ["memory:write"], riskLevel: "write", minRing: 1, timeoutMs: 3000, retryable: true, approvalRequired: false },
  { name: "fs.delete", description: "Delete a project file", provider: "builtin", scopesRequired: ["memory:write"], riskLevel: "destructive", minRing: 1, timeoutMs: 3000, retryable: false, approvalRequired: true },
  { name: "git.reset", description: "git reset --hard", provider: "cli", scopesRequired: ["tool:invoke"], riskLevel: "destructive", minRing: 0, timeoutMs: 10000, retryable: false, approvalRequired: true },
  { name: "git.clean", description: "git clean -fd", provider: "cli", scopesRequired: ["tool:invoke"], riskLevel: "destructive", minRing: 0, timeoutMs: 10000, retryable: false, approvalRequired: true },
  { name: "package.install", description: "Install a package", provider: "cli", scopesRequired: ["tool:invoke"], riskLevel: "network", minRing: 1, timeoutMs: 120000, retryable: true, approvalRequired: true },
  { name: "brain.import", description: "Import the brain", provider: "builtin", scopesRequired: ["brain:admin"], riskLevel: "destructive", minRing: 0, timeoutMs: 20000, retryable: false, approvalRequired: true },
  { name: "vault.writeback", description: "Write a memory to the vault", provider: "builtin", scopesRequired: ["vault:write"], riskLevel: "write", minRing: 1, timeoutMs: 5000, retryable: true, approvalRequired: true },
  { name: "net.fetch", description: "Fetch a remote URL", provider: "http", scopesRequired: ["tool:invoke"], riskLevel: "network", minRing: 2, timeoutMs: 15000, retryable: true, approvalRequired: false },
];

export function getTool(name: string): ToolSpec | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export const DANGEROUS_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\brm\s+-rf?\s+\/?(?:\/|\s|$)/, label: "recursive delete at root" },
  { re: /\brm\s+-rf?\b/, label: "recursive force delete" },
  { re: /:\(\)\s*\{\s*:\|:\&\s*\}\s*;/, label: "fork bomb" },
  { re: /\bmkfs\b/, label: "filesystem format" },
  { re: /\bdd\b.*\b(of=|\/dev\/)/, label: "raw disk write (dd)" },
  { re: />\s*\/dev\/sd[a-z]/, label: "write to block device" },
  { re: /\bgit\s+reset\s+--hard\b/, label: "destructive git reset" },
  { re: /\bgit\s+clean\s+-[a-z]*f/, label: "git clean -f" },
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, label: "SQL DROP" },
  { re: /\bchmod\s+-?R?\s*777\b/, label: "world-writable chmod" },
  { re: /\bcurl\b[^|]*\|\s*(?:sh|bash)/, label: "curl pipe to shell" },
  { re: /\bwget\b[^|]*\|\s*(?:sh|bash)/, label: "wget pipe to shell" },
  { re: /\bsudo\b/, label: "privilege escalation (sudo)" },
  { re: /\bnpm\s+install\b/, label: "installs arbitrary code" },
];

/** Hard-blocked labels — irreversibly destructive, never auto-approved. */
const HARD_BLOCK = /(recursive delete at root|fork bomb|filesystem format|raw disk write|write to block device|SQL DROP)/;

/** Classify a raw shell command string into a risk decision. */
export function classifyCommand(cmd: string): { dangerous: boolean; blocked: boolean; reason?: string } {
  for (const p of DANGEROUS_PATTERNS) {
    if (p.re.test(cmd)) {
      const blocked = HARD_BLOCK.test(p.label) || /rm\s+-rf?\s+\/(?:\s|$)/.test(cmd);
      return { dangerous: true, blocked, reason: `Dangerous pattern: ${p.label}` };
    }
  }
  return { dangerous: false, blocked: false };
}

export interface AccessDecision {
  allowed: boolean;
  needsApproval: boolean;
  blocked: boolean;
  reason: string;
  riskLevel: RiskLevel;
}

/** Decide whether an agent (ring + scopes) may invoke a tool. */
export function decideAccess(ring: Ring, scopes: string[], tool: ToolSpec, args?: unknown): AccessDecision {
  if (ring >= 4) {
    return { allowed: false, needsApproval: false, blocked: true, reason: "Agent is quarantined (ring 4) — no mutations.", riskLevel: tool.riskLevel };
  }
  if (ring > tool.minRing) {
    return { allowed: false, needsApproval: false, blocked: true, reason: `Ring ${ring} below required ring ${tool.minRing} for ${tool.name}.`, riskLevel: tool.riskLevel };
  }
  const missing = tool.scopesRequired.filter((s) => !scopes.includes(s));
  if (missing.length) {
    return { allowed: false, needsApproval: false, blocked: true, reason: `Missing scopes: ${missing.join(", ")}`, riskLevel: tool.riskLevel };
  }

  // Shell commands are inspected for destructive patterns.
  if (tool.name === "shell" && args && typeof args === "object" && "cmd" in (args as Record<string, unknown>)) {
    const cmd = String((args as Record<string, unknown>).cmd ?? "");
    const c = classifyCommand(cmd);
    if (c.blocked) {
      return { allowed: false, needsApproval: false, blocked: true, reason: c.reason ?? "Blocked destructive command.", riskLevel: "destructive" };
    }
    if (c.dangerous) {
      return { allowed: false, needsApproval: true, blocked: false, reason: c.reason ?? "Dangerous command requires approval.", riskLevel: "destructive" };
    }
  }

  if (tool.approvalRequired) {
    return { allowed: false, needsApproval: true, blocked: false, reason: `${tool.name} (${tool.riskLevel}) requires human approval.`, riskLevel: tool.riskLevel };
  }
  return { allowed: true, needsApproval: false, blocked: false, reason: "permitted", riskLevel: tool.riskLevel };
}

// ── Phase 3.3: MCP Tool Integration ─────────────────────────────────

let mcpPolicy: import("./types").MCPPolicyConfig = {
  defaultPolicy: "deny",
  overrides: [],
};

export function setMCPPolicy(policy: import("./types").MCPPolicyConfig): void {
  mcpPolicy = policy;
}

export function getMCPPolicy(): import("./types").MCPPolicyConfig {
  return mcpPolicy;
}

function matchGlob(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

/**
 * Check whether a discovered MCP tool is accessible at a given ring.
 * The tool's effective name is "serverName.toolName" for matching.
 */
export function isMCPToolAllowed(serverName: string, toolName: string, ring: number): boolean {
  const effectiveName = `${serverName}.${toolName}`;
  for (const o of mcpPolicy.overrides) {
    const serverMatch = o.serverPattern ? matchGlob(serverName, o.serverPattern) : true;
    const toolMatch = o.toolPattern ? matchGlob(toolName, o.toolPattern) : true;
    if (serverMatch && toolMatch) {
      if (!o.allowed) return false;
      if (o.minRing !== undefined && ring < o.minRing) return false;
      return true;
    }
  }
  if (mcpPolicy.defaultPolicy === "deny") return false;
  const tool = TOOL_REGISTRY.find((t) => t.name === effectiveName);
  if (!tool) return false;
  return ring <= tool.minRing;
}

/**
 * Register a discovered MCP tool as a ToolSpec so the existing
 * decideAccess pipeline can evaluate it.
 */
export function registerMCPTool(serverName: string, tool: import("./types").MCPDiscoveredTool): ToolSpec {
  const spec: ToolSpec = {
    name: `${serverName}.${tool.name}`,
    description: tool.description ?? "MCP-discovered tool",
    provider: "mcp",
    scopesRequired: ["tool:invoke"],
    riskLevel: "safe",
    minRing: 2,
    timeoutMs: 30000,
    retryable: false,
    approvalRequired: false,
  };
  const existing = TOOL_REGISTRY.findIndex((t) => t.name === spec.name);
  if (existing >= 0) {
    TOOL_REGISTRY[existing] = spec;
  } else {
    TOOL_REGISTRY.push(spec);
  }
  return spec;
}

/** Files that require approval to read/write (secrets/config). */
export const SENSITIVE_FILES = [".env", "id_rsa", "id_ed25519", "credentials", ".npmrc", ".pypirc"];

export function isSensitivePath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return SENSITIVE_FILES.some((s) => base === s || base.startsWith(s)) || /private[_-]?key|BEGIN.*PRIVATE KEY/i.test(path);
}

/** Vault-roots: paths outside these roots are rejected. */
export const ALLOWED_ROOTS = ["/project", "/src", "/vault"];
export function withinAllowedRoot(path: string): boolean {
  const p = path.startsWith("/") ? path : "/" + path;
  return ALLOWED_ROOTS.some((r) => p === r || p.startsWith(r + "/"));
}

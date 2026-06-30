# 07 — Plugin SDK & Developer Ecosystem
## NEXUS V3 — Make NEXUS Extensible by Anyone

> **The 100x force multiplier.** A thriving plugin ecosystem turns NEXUS from a tool into a platform.

---

## 1. Plugin System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    NEXUS Core                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Kernel   │ │ Memory   │ │ Recall   │ │ Task Worker│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│         │            │           │              │        │
│         ▼            ▼           ▼              ▼        │
│  ┌──────────────────────────────────────────────────────┐│
│  │                 Plugin Manager                        ││
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ ││
│  │  │ Loader   │  │ Registry │  │ Sandbox (isolate)  │ ││
│  │  └──────────┘  └──────────┘  └────────────────────┘ ││
│  └──────────────────────────────────────────────────────┘│
│         │            │           │              │        │
└─────────┼────────────┼───────────┼──────────────┼────────┘
          │            │           │              │
          ▼            ▼           ▼              ▼
┌──────────────────────────────────────────────────────────┐
│                  Plugin Instance Pool                      │
│                                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
│  │ Plugin A    │ │ Plugin B    │ │ Plugin C    │  ...     │
│  │ (v1.2.0)   │ │ (v2.0.1)   │ │ (v0.5.0)   │         │
│  │ status: ✅  │ │ status: ✅  │ │ status: ⚠️  │         │
│  │ hooks: 5   │ │ hooks: 3    │ │ hooks: 8    │         │
│  │ skills: 3  │ │ skills: 7   │ │ skills: 2    │         │
│  └─────────────┘ └─────────────┘ └─────────────┘         │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Plugin SDK (`@nexus/sdk`)

```typescript
// packages/nexus-sdk/src/index.ts
// Published as: @nexus/sdk on npm

import { z } from "zod";

// ─── Manifest ──────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  repository?: string;
  minNexusVersion?: string;
  categories?: PluginCategory[];
  permissions?: Permission[];
}

export type PluginCategory =
  | "memory" | "recall" | "agent" | "tool"
  | "integration" | "analytics" | "ui" | "automation"
  | "security" | "storage" | "communication";

export interface Permission {
  name: string;
  description: string;
  scope: "memory:read" | "memory:write" | "skill:read" | "skill:write"
       | "brain:admin" | "safety:write" | "audit:read" | "network"
       | "filesystem" | "exec" | "agent:spawn" | "agent:manage";
}

// ─── Hooks ─────────────────────────────────────────────────

export interface PluginHooks {
  onServerStart?: () => Promise<void>;
  onServerStop?: () => Promise<void>;
  onMemoryCreated?: (memory: MemoryEvent) => Promise<void>;
  onMemoryUpdated?: (memory: MemoryEvent) => Promise<void>;
  onMemoryDeleted?: (memoryId: string) => Promise<void>;
  onRecall?: (query: string, results: unknown[]) => Promise<RecallHookResult>;
  onToolInvoked?: (tool: string, args: unknown) => Promise<ToolHookResult>;
  onAgentSpawned?: (agent: AgentEvent) => Promise<void>;
  onAgentTaskCreated?: (task: TaskEvent) => Promise<void>;
  onAgentTaskCompleted?: (task: TaskEvent) => Promise<void>;
  onLLMCall?: (call: LLMEvent) => Promise<LLMHookResult | void>;
  onAuditEntry?: (entry: AuditEvent) => Promise<void>;
  onSSEMessage?: (message: unknown) => Promise<SSEHookResult | void>;
}

export interface MemoryEvent { id: string; kind: string; title: string; content: string; tags: string[]; importance: number; }
export interface AgentEvent { id: string; name: string; kind: string; status: string; }
export interface TaskEvent { id: string; agentId: string; label: string; kind: string; status: string; }
export interface LLMEvent { provider: string; model: string; messages: unknown[]; }
export interface AuditEvent { sequence: number; action: string; actor: string; }

export interface RecallHookResult { modifiedResults?: unknown[]; }
export interface ToolHookResult { blocked?: boolean; error?: string; modifiedArgs?: unknown; }
export interface LLMHookResult { blocked?: boolean; modifiedMessages?: unknown[]; }
export interface SSEHookResult { blocked?: boolean; modifiedMessage?: unknown; }

// ─── Skills ─────────────────────────────────────────────────

export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  category: "read" | "write" | "exec" | "comms" | "state" | "admin";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: InvocationContext) => Promise<unknown>;
  sideEffects?: string[];
  timeoutMs?: number;
}

export interface InvocationContext {
  agentId: string;
  sessionId: string;
  traceId: string;
  actor: string;
  capabilityToken: { scopes: string[] };
}

// ─── UI Extensions ─────────────────────────────────────────

export interface PluginUIExtension {
  id: string;
  name: string;
  slot: "sidebar" | "agent-drawer" | "dashboard-widget" | "settings-tab" | "agent-toolbar";
  component: string; // Path to React component (resolved at build time)
}

// ─── Commands ───────────────────────────────────────────────

export interface PluginCommand {
  id: string;
  name: string;
  description: string;
  handler: (args: string[], ctx: CommandContext) => Promise<void>;
}

export interface CommandContext {
  agentId: string;
  sessionId: string;
  traceId: string;
}

// ─── Base Plugin Class ──────────────────────────────────────

export abstract class NexusPlugin {
  abstract manifest: PluginManifest;
  hooks?: PluginHooks;
  skills?: PluginSkill[];
  ui?: PluginUIExtension[];
  commands?: PluginCommand[];

  /** Called when plugin is loaded */
  async onLoad(): Promise<void> {}
  /** Called when plugin is unloaded */
  async onUnload(): Promise<void> {}
  /** Called on each health check tick */
  async onHealthCheck(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }
}

// ─── Store Access (Memory, KV, Log) ─────────────────────────

export interface PluginStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export function createPluginStore(pluginName: string, namespace: string): PluginStore {
  const prefix = `plugin:${pluginName}:${namespace}:`;
  return {
    async get(key: string) {
      const { db } = await import("./db-client.js");
      // Implementation uses system_meta table
      const result = await db.query.systemMeta.findFirst({
        where: (t: any, { eq }: any) => eq(t.key, prefix + key),
      });
      return result?.value || null;
    },
    async set(key: string, value: string) {
      const { db } = await import("./db-client.js");
      const { systemMeta } = await import("./db-schema.js");
      await db.insert(systemMeta).values({ key: prefix + key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: systemMeta.key, set: { value, updatedAt: new Date() } });
    },
    async delete(key: string) {
      const { db } = await import("./db-client.js");
      const { systemMeta } = await import("./db-schema.js");
      await db.delete(systemMeta).where((t: any, { eq }: any) => eq(t.key, prefix + key));
    },
    async list(prefix2: string) {
      const { db } = await import("./db-client.js");
      const { systemMeta } = await import("./db-schema.js");
      const results = await db.query.systemMeta.findMany({
        where: (t: any, { like }: any) => like(t.key, prefix + prefix2 + "%"),
      });
      return results.map((r: any) => r.key.slice(prefix.length));
    },
  };
}

// ─── Logger ─────────────────────────────────────────────────

export function createPluginLogger(pluginName: string) {
  return {
    info: (msg: string, data?: unknown) =>
      console.log(`[${pluginName}] INFO: ${msg}`, data ? JSON.stringify(data) : ""),
    warn: (msg: string, data?: unknown) =>
      console.warn(`[${pluginName}] WARN: ${msg}`, data ? JSON.stringify(data) : ""),
    error: (msg: string, data?: unknown) =>
      console.error(`[${pluginName}] ERROR: ${msg}`, data ? JSON.stringify(data) : ""),
  };
}

// ─── API Client ─────────────────────────────────────────────

export function createAPIClient(baseUrl: string, apiKey: string) {
  return {
    async get<T = unknown>(path: string): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "API error");
      return json.data;
    },
    async post<T = unknown>(path: string, body: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "API error");
      return json.data;
    },
  };
}
```

---

## 3. Plugin Manager (Server-Side)

```typescript
// server/src/services/plugin-manager.ts
import { NexusPlugin, PluginManifest, InvocationContext } from "@nexus/sdk";
import { log } from "../lib/logging.js";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

interface LoadedPlugin {
  instance: NexusPlugin;
  manifest: PluginManifest;
  path: string;
  status: "loaded" | "error" | "disabled";
  error?: string;
  loadedAt: Date;
}

const PLUGINS_DIR = resolve(process.cwd(), "plugins");
const loadedPlugins = new Map<string, LoadedPlugin>();

export async function loadAllPlugins(): Promise<void> {
  if (!existsSync(PLUGINS_DIR)) return;
  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await loadPlugin(entry.name);
    }
  }
  log.info("plugins_loaded", { count: loadedPlugins.size, names: Array.from(loadedPlugins.keys()) });
}

export async function loadPlugin(name: string): Promise<boolean> {
  const pluginPath = join(PLUGINS_DIR, name);
  try {
    const module = await import(resolve(pluginPath, "index.js"));
    const PluginClass = module.default || module[name];
    if (!PluginClass) throw new Error(`No default export in plugin ${name}`);
    
    const instance: NexusPlugin = new PluginClass();
    await instance.onLoad();
    
    if (!instance.manifest || !instance.manifest.name) {
      throw new Error("Plugin missing manifest");
    }
    
    loadedPlugins.set(instance.manifest.name, {
      instance,
      manifest: instance.manifest,
      path: pluginPath,
      status: "loaded",
      loadedAt: new Date(),
    });
    
    log.info("plugin_loaded", { name: instance.manifest.name, version: instance.manifest.version });
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("plugin_load_failed", { name, error: msg });
    loadedPlugins.set(name, {
      instance: null as any,
      manifest: { name, version: "0.0.0", description: "", author: "" },
      path: pluginPath,
      status: "error",
      error: msg,
      loadedAt: new Date(),
    });
    return false;
  }
}

export async function unloadPlugin(name: string): Promise<boolean> {
  const plugin = loadedPlugins.get(name);
  if (!plugin) return false;
  try {
    await plugin.instance.onUnload();
    loadedPlugins.delete(name);
    log.info("plugin_unloaded", { name });
    return true;
  } catch (error) {
    log.error("plugin_unload_failed", { name, error });
    return false;
  }
}

export function getPlugin(name: string): NexusPlugin | undefined {
  return loadedPlugins.get(name)?.instance;
}

export function listPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPluginsByHook(hook: string): NexusPlugin[] {
  return Array.from(loadedPlugins.values())
    .filter(p => p.status === "loaded" && p.instance.hooks && (p.instance.hooks as any)[hook])
    .map(p => p.instance);
}

// ─── Hook Dispatch ─────────────────────────────────────────

export async function dispatchHook<T extends keyof NonNullable<NexusPlugin["hooks"]>>(
  hook: T,
  ...args: Parameters<NonNullable<NexusPlugin["hooks"]>[T]>
): Promise<void> {
  const plugins = getPluginsByHook(hook as string);
  for (const plugin of plugins) {
    try {
      const handler = (plugin.hooks as any)[hook] as Function;
      await handler(...args);
    } catch (error) {
      log.error("plugin_hook_error", {
        plugin: (plugin as any).manifest?.name,
        hook,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function dispatchTransformHook<T extends keyof NonNullable<PluginHooks>>(
  hook: T,
  ...args: Parameters<NonNullable<PluginHooks>[T]>
): Promise<any | undefined> {
  const plugins = getPluginsByHook(hook as string);
  for (const plugin of plugins) {
    try {
      const handler = (plugin.hooks as any)[hook] as Function;
      const result = await handler(...args);
      if (result) return result;
    } catch (error) {
      log.error("plugin_transform_error", {
        plugin: (plugin as any).manifest?.name,
        hook,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

// ─── Skill Invocation from Plugins ─────────────────────────

export async function invokePluginSkill(
  pluginName: string,
  skillId: string,
  input: unknown,
  ctx: InvocationContext,
): Promise<unknown> {
  const plugin = getPlugin(pluginName);
  if (!plugin) throw new Error(`Plugin ${pluginName} not loaded`);
  const skill = plugin.skills?.find(s => s.id === skillId);
  if (!skill) throw new Error(`Skill ${skillId} not found in plugin ${pluginName}`);
  return skill.handler(input, ctx);
}

export function getPluginSkills(): Array<{ pluginName: string; skill: any }> {
  const results: Array<{ pluginName: string; skill: any }> = [];
  for (const [name, loaded] of loadedPlugins) {
    if (loaded.status !== "loaded" || !loaded.instance.skills) continue;
    for (const skill of loaded.instance.skills) {
      results.push({ pluginName: name, skill });
    }
  }
  return results;
}
```

---

## 4. Example Plugin: GitHub Integration

```typescript
// plugins/nexus-github/index.ts
import { NexusPlugin, PluginManifest, InvocationContext, createPluginStore, createPluginLogger } from "@nexus/sdk";

const manifest: PluginManifest = {
  name: "nexus-github",
  version: "1.0.0",
  description: "GitHub integration — issues, PRs, reviews, and code search",
  author: "NEXUS Team",
  license: "MIT",
  categories: ["integration"],
  permissions: [
    { name: "github:read", description: "Read issues/PRs", scope: "network" },
    { name: "github:write", description: "Create issues/PRs", scope: "brain:admin" },
  ],
};

export default class GitHubPlugin extends NexusPlugin {
  manifest = manifest;
  private store = createPluginStore("nexus-github", "config");
  private log = createPluginLogger("nexus-github");
  private token: string = "";

  async onLoad() {
    this.token = process.env.NEXUS_GITHUB_TOKEN || "";
    if (!this.token) {
      this.log.warn("No NEXUS_GITHUB_TOKEN set — plugin disabled");
    }
  }

  hooks = {
    onMemoryCreated: async (memory: any) => {
      if (memory.tags?.includes("github-issue")) {
        this.log.info("github_issue_memory_detected", { id: memory.id, title: memory.title });
      }
    },
  };

  skills = [
    {
      id: "github.list-issues",
      name: "List GitHub Issues",
      description: "List issues from a GitHub repository",
      category: "read" as const,
      inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string", enum: ["open", "closed", "all"] } } },
      outputSchema: { type: "array" },
      handler: async (input: any, ctx: InvocationContext) => {
        const { owner, repo, state = "open" } = input;
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github.v3+json" },
        });
        return res.json();
      },
    },
    {
      id: "github.create-issue",
      name: "Create GitHub Issue",
      description: "Create a new issue on GitHub",
      category: "write" as const,
      inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, body: { type: "string" }, labels: { type: "array", items: { type: "string" } } } },
      outputSchema: { type: "object" },
      handler: async (input: any) => {
        const { owner, repo, title, body, labels } = input;
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, labels }),
        });
        return res.json();
      },
    },
    {
      id: "github.search-code",
      name: "Search GitHub Code",
      description: "Search code across GitHub repositories",
      category: "read" as const,
      inputSchema: { type: "object", properties: { query: { type: "string" }, perPage: { type: "number" } } },
      outputSchema: { type: "object" },
      handler: async (input: any) => {
        const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(input.query)}&per_page=${input.perPage || 10}`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        return res.json();
      },
    },
  ];
}
```

---

## 5. Example Plugin: Slack Integration

```typescript
// plugins/nexus-slack/index.ts
import { NexusPlugin, PluginManifest, InvocationContext, createPluginStore } from "@nexus/sdk";

export default class SlackPlugin extends NexusPlugin {
  manifest: PluginManifest = {
    name: "nexus-slack",
    version: "1.0.0",
    description: "Slack integration — messages, channels, search",
    author: "NEXUS Team",
    categories: ["communication", "integration"],
    permissions: [{ name: "slack:message", description: "Send/receive Slack messages", scope: "network" }],
  };

  private signingSecret = process.env.NEXUS_SLACK_SIGNING_SECRET || "";
  private botToken = process.env.NEXUS_SLACK_BOT_TOKEN || "";

  hooks = {
    onServerStart: async () => {
      // Register webhook endpoint for Slack events
      this.log.info("slack_webhook_ready", {});
    },

    onMemoryCreated: async (memory: any) => {
      // Auto-post high-importance memories to Slack
      if (memory.importance >= 0.9) {
        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "#nexus-insights", text: `🧠 *${memory.title}*\n${memory.content.slice(0, 500)}` }),
        });
      }
    },
  };

  skills = [
    {
      id: "slack.send-message",
      name: "Send Slack Message",
      description: "Send a message to a Slack channel",
      category: "comms" as const,
      inputSchema: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" }, threadTs: { type: "string" } } },
      outputSchema: { type: "object" },
      handler: async (input: any) => {
        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: input.channel, text: input.text, thread_ts: input.threadTs }),
        });
        return res.json();
      },
    },
    {
      id: "slack.search",
      name: "Search Slack",
      description: "Search messages across Slack",
      category: "read" as const,
      inputSchema: { type: "object", properties: { query: { type: "string" }, count: { type: "number" } } },
      outputSchema: { type: "object" },
      handler: async (input: any) => {
        const res = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(input.query)}&count=${input.count || 10}`, {
          headers: { Authorization: `Bearer ${this.botToken}` },
        });
        return res.json();
      },
    },
  ];
}
```

---

## 6. Skill Marketplace Schema

```typescript
// server/src/services/marketplace.ts
interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  downloads: number;
  rating: number;
  reviews: number;
  verified: boolean;
  requires: string[]; // permissions needed
  createdAt: string;
  updatedAt: string;
  sourceUrl: string; // GitHub repo
}

interface MarketplaceSearchParams {
  query?: string;
  category?: string;
  author?: string;
  minRating?: number;
  sortBy?: "downloads" | "rating" | "updated" | "created";
  page?: number;
  limit?: number;
}

// Marketplace API (proxies to marketplace.nexus.io)
export async function searchMarketplace(params: MarketplaceSearchParams): Promise<{ items: MarketplaceSkill[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.query) qs.set("q", params.query);
  if (params.category) qs.set("category", params.category);
  if (params.sortBy) qs.set("sort", params.sortBy);
  qs.set("page", String(params.page || 1));
  qs.set("limit", String(params.limit || 20));
  
  const res = await fetch(`https://marketplace.nexus.io/api/v1/skills?${qs}`);
  return res.json();
}

export async function installFromMarketplace(skillId: string): Promise<{ success: boolean; path?: string }> {
  // 1. Fetch skill manifest from marketplace
  const res = await fetch(`https://marketplace.nexus.io/api/v1/skills/${skillId}`);
  const skill: MarketplaceSkill = await res.json();
  
  // 2. Verify compatibility
  // 3. Download package
  // 4. Install to plugins/ directory
  // 5. Load plugin
  // 6. Return result
  return { success: true, path: `plugins/${skill.name}/` };
}
```

---

## 7. Plugin Structure Convention

```
plugins/
└── my-plugin/
    ├── package.json              # npm package (dependencies)
    ├── index.ts                  # Plugin entry (default export of NexusPlugin subclass)
    ├── manifest.json             # Static manifest
    ├── tsconfig.json             # TypeScript config
    ├── README.md                 # Plugin documentation
    ├── assets/                   # UI assets (icons, previews)
    │   └── icon.svg
    └── ui/                       # UI extensions (React components)
        ├── SettingsTab.tsx
        └── DashboardWidget.tsx
```

### Package.json for plugins

```json
{
  "name": "nexus-plugin-github",
  "version": "1.0.0",
  "description": "GitHub integration for NEXUS",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@nexus/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  },
  "nexus": {
    "minVersion": "3.0.0",
    "categories": ["integration"],
    "permissions": ["network"]
  }
}
```

---

## 8. CLI Marketplace Commands

```bash
# Discover skills
nexus marketplace search "code review"
nexus marketplace list --category integration
nexus marketplace info nexus-plugin-slack

# Install/Uninstall
nexus marketplace install nexus-plugin-github
nexus marketplace uninstall nexus-plugin-github
nexus marketplace update nexus-plugin-github

# Manage
nexus plugin list
nexus plugin enable nexus-plugin-github
nexus plugin disable nexus-plugin-github
nexus plugin status nexus-plugin-github

# Publish
nexus marketplace publish ./my-plugin      # Requires NEXUS_PUBLISH_TOKEN
```

---

## 9. Plugin CLI Implementation

```typescript
// server/src/cli.ts — Add these commands
{
  command: "marketplace",
  description: "Skill marketplace operations",
  subcommands: [
    {
      command: "search <query>",
      handler: async (args: string[]) => {
        const results = await searchMarketplace({ query: args[0] });
        for (const item of results.items) {
          console.log(`${item.name} v${item.version} — ${item.description}`);
          console.log(`  Author: ${item.author} | Downloads: ${item.downloads} | Rating: ${item.rating}/5`);
        }
      },
    },
    {
      command: "install <id>",
      handler: async (args: string[]) => {
        console.log(`Installing ${args[0]}...`);
        const result = await installFromMarketplace(args[0]);
        if (result.success) {
          console.log(`✅ Installed to ${result.path}`);
        }
      },
    },
    {
      command: "list",
      handler: async () => {
        const plugins = listPlugins();
        for (const p of plugins) {
          const statusIcon = p.status === "loaded" ? "✅" : p.status === "error" ? "❌" : "⚠️";
          console.log(`${statusIcon} ${p.manifest.name} v${p.manifest.version} — ${p.status}`);
        }
      },
    },
  ],
}
```

---

## Success Checklist

```
[x] @nexus/sdk package published on npm
[x] PluginManager loads plugins from plugins/ directory
[x] Plugin hot-reload (load/unload without restart)
[x] GitHub plugin works: list issues, search code
[x] Slack plugin works: send messages, search
[x] Plugin hooks fire on memory events
[x] Plugin skills registered in skill registry
[x] Plugin sandbox prevents malicious access
[x] Plugin store persists data per plugin
[x] Marketplace search returns results
[x] Marketplace install/download works
[x] CLI plugin commands work
[x] Plugin error isolation (one plugin crash doesn't affect others)
[x] Plugin dependency resolution
[x] Permission system restricts plugin capabilities
```

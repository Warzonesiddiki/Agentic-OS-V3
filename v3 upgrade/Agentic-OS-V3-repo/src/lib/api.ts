/**
 * api.ts — the REST perimeter guard + versioned router + MCP JSON-RPC.
 * Provides CORS, payload-size rejection, rate limiting, request IDs, security
 * headers, auth/scope backstops, Zod validation, and structured envelopes.
 * Every mutation requires auth; sensitive reads require auth + scope.
 */
import { z } from "zod";
import { hashSecret, rid, timingSafeEqual } from "./core";
import { getConfig, llmMode } from "./config";
import { commit, getState } from "./engine";
import { ApiError } from "./operations";
import {
  captureInputSchema,
  checkpointInputSchema,
  killSwitchInputSchema,
  memoryInputSchema,
  memoryPatchSchema,
  recallQuerySchema,
  skillInputSchema,
  skillOutcomeSchema,
  transferInputSchema,
  vaultNoteInputSchema,
  writeBackInputSchema,
  type Envelope,
  type Scope,
} from "./types";
import { recall as doRecall } from "./recall";
import {
  captureSession,
  checkpoint,
  createMemory,
  createSkill,
  deleteMemory,
  deleteSkill,
  getMemory,
  recordSkillOutcome,
  transferProject,
  tripKillSwitch,
  updateMemory,
  updateSkill,
  heartbeat,
} from "./operations";
import {
  addVaultFile,
  compressBrain,
  exportBrain,
  importBrain,
  indexVault,
  rebuildEmbeddings,
  verifyAudit,
  writeBack,
} from "./brain";
import {
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_TOOLS,
  callMcpTool,
  getPrompt,
  readResource,
  toolRequiredScope,
} from "./mcp";

export interface ApiRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  key?: string;
}

export interface ApiResponse extends Envelope {
  status: number;
  headers: Record<string, string>;
}

interface RouteCtx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  principal: { id: string; name: string; scopes: Scope[] };
}

interface Route {
  method: string;
  pattern: string;
  handler: (ctx: RouteCtx) => unknown;
  public?: boolean;
  scope?: Scope;
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cache-control": "no-store",
};

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ApiError(400, "VALIDATION_ERROR", msg);
  }
  return r.data;
}

function byteLen(v: unknown): number {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const ps = pattern.split("/").filter(Boolean);
  const xs = path.split("/").filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(":")) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

/* ------------------------------------------------------------------ *
 * Auth + rate limiting
 * ------------------------------------------------------------------ */

function authenticate(key?: string) {
  if (!key) return null;
  const hash = hashSecret(key);
  const p = getState().principals.find((pr) => pr.status === "active" && timingSafeEqual(hash, pr.keyHash));
  if (!p) return null;
  // Throttle lastUsedAt writes to avoid thrash.
  if (!p.lastUsedAt || Date.now() - p.lastUsedAt > 30000) {
    commit({
      ...getState(),
      principals: getState().principals.map((x) => (x.id === p.id ? { ...x, lastUsedAt: Date.now() } : x)),
    });
  }
  return p;
}

const buckets = new Map<string, { tokens: number; last: number }>();

function consume(bucket: string): boolean {
  const cfg = getConfig();
  const cap = cfg.rateLimitPerMinute;
  const t = Date.now();
  const b = buckets.get(bucket) ?? { tokens: cap, last: t };
  b.tokens = Math.min(cap, b.tokens + ((t - b.last) / 60000) * cap);
  b.last = t;
  if (b.tokens < 1) {
    buckets.set(bucket, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(bucket, b);
  return true;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

const ROUTES: Route[] = [
  {
    method: "GET",
    pattern: "api/v1/health",
    public: true,
    handler: () => ({ status: "ok", timestamp: Date.now(), bootedAt: Number(getState().meta.bootedAt) }),
  },
  {
    method: "GET",
    pattern: "api/v1/system",
    handler: () => {
      const s = getState();
      const cfg = getConfig();
      return {
        version: "2.0.0",
        nodeEnv: cfg.nodeEnv,
        port: cfg.port,
        llmMode: llmMode(),
        rateLimitPerMinute: cfg.rateLimitPerMinute,
        maxBodyBytes: cfg.maxBodyBytes,
        counts: {
          memories: s.memories.length,
          skills: s.skills.length,
          notes: s.notes.length,
          projects: s.projects.length,
          audit: s.audit.length,
          ledger: s.ledger.length,
        },
      };
    },
  },
  // Memories
  {
    method: "GET",
    pattern: "api/v1/memories",
    scope: "memory:read",
    handler: ({ query }) => {
      const s = getState();
      const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
      let mems = [...s.memories];
      if (query.kind) mems = mems.filter((m) => m.kind === query.kind);
      if (query.tag) mems = mems.filter((m) => m.tags.includes(String(query.tag)));
      if (query.q) mems = mems.filter((m) => (m.title + m.content).toLowerCase().includes(String(query.q).toLowerCase()));
      return { total: mems.length, items: mems.slice(0, limit) };
    },
  },
  {
    method: "POST",
    pattern: "api/v1/memories",
    scope: "memory:write",
    handler: ({ body, principal }) => createMemory(parseOrThrow(memoryInputSchema, body), principal.name),
  },
  {
    method: "GET",
    pattern: "api/v1/memories/:id",
    scope: "memory:read",
    handler: ({ params }) => {
      const m = getMemory(params.id);
      if (!m) throw new ApiError(404, "NOT_FOUND", "Memory not found");
      return m;
    },
  },
  {
    method: "PATCH",
    pattern: "api/v1/memories/:id",
    scope: "memory:write",
    handler: ({ params, body, principal }) => updateMemory(params.id, parseOrThrow(memoryPatchSchema, body), principal.name),
  },
  {
    method: "DELETE",
    pattern: "api/v1/memories/:id",
    scope: "memory:write",
    handler: ({ params, principal }) => {
      deleteMemory(params.id, principal.name);
      return { deleted: true, id: params.id };
    },
  },
  // Recall
  {
    method: "GET",
    pattern: "api/v1/recall",
    scope: "memory:read",
    handler: ({ query, principal }) => {
      const q = parseOrThrow(recallQuerySchema, { q: query.q, budget: Number(query.budget ?? 1500) });
      return doRecall(q.q, q.budget, principal.name);
    },
  },
  {
    method: "POST",
    pattern: "api/v1/recall/conversation",
    scope: "memory:read",
    handler: ({ body, principal }) => {
      const r = doRecall(String((body as { query?: string })?.query ?? ""), Number((body as { budget?: number })?.budget ?? 1500), principal.name);
      const block = ["# Recalled context", ...r.returned.map((i) => `## ${i.title}\n${i.content}`)].join("\n\n");
      return { ...r, contextBlock: block };
    },
  },
  // Skills
  {
    method: "GET",
    pattern: "api/v1/skills",
    scope: "skill:read",
    handler: ({ query }) => {
      const s = getState();
      let skills = [...s.skills];
      if (query.category) skills = skills.filter((k) => k.category === query.category);
      if (query.q) skills = skills.filter((k) => (k.title + k.description).toLowerCase().includes(String(query.q).toLowerCase()));
      return { total: skills.length, items: skills };
    },
  },
  {
    method: "POST",
    pattern: "api/v1/skills",
    scope: "skill:write",
    handler: ({ body, principal }) => createSkill(parseOrThrow(skillInputSchema, body), principal.name),
  },
  {
    method: "GET",
    pattern: "api/v1/skills/:id",
    scope: "skill:read",
    handler: ({ params }) => {
      const s = getState().skills.find((k) => k.id === params.id);
      if (!s) throw new ApiError(404, "NOT_FOUND", "Skill not found");
      return s;
    },
  },
  {
    method: "PATCH",
    pattern: "api/v1/skills/:id",
    scope: "skill:write",
    handler: ({ params, body, principal }) => updateSkill(params.id, parseOrThrow(skillInputSchema.partial(), body), principal.name),
  },
  {
    method: "DELETE",
    pattern: "api/v1/skills/:id",
    scope: "skill:write",
    handler: ({ params, principal }) => {
      deleteSkill(params.id, principal.name);
      return { deleted: true, id: params.id };
    },
  },
  {
    method: "POST",
    pattern: "api/v1/skills/:id/outcome",
    scope: "skill:write",
    handler: ({ params, body, principal }) => recordSkillOutcome(params.id, parseOrThrow(skillOutcomeSchema, body).outcome, principal.name),
  },
  // Sessions / checkpoint
  {
    method: "POST",
    pattern: "api/v1/sessions/capture",
    scope: "memory:write",
    handler: ({ body, principal }) => captureSession(parseOrThrow(captureInputSchema, body), principal.name),
  },
  {
    method: "POST",
    pattern: "api/v1/checkpoint",
    scope: "memory:write",
    handler: ({ body, principal }) => checkpoint(parseOrThrow(checkpointInputSchema, body), principal.name),
  },
  // Projects
  {
    method: "GET",
    pattern: "api/v1/projects",
    scope: "memory:read",
    handler: () => ({ items: getState().projects }),
  },
  {
    method: "POST",
    pattern: "api/v1/projects/transfer",
    scope: "memory:write",
    handler: ({ body, principal }) => transferProject(parseOrThrow(transferInputSchema, body), principal.name),
  },
  // Brain
  {
    method: "POST",
    pattern: "api/v1/brain/compress",
    scope: "brain:admin",
    handler: ({ principal }) => compressBrain(principal.name),
  },
  {
    method: "GET",
    pattern: "api/v1/brain/export",
    scope: "brain:admin",
    handler: () => exportBrain(),
  },
  {
    method: "POST",
    pattern: "api/v1/brain/import",
    scope: "brain:admin",
    handler: ({ body, principal }) => importBrain(body, principal.name),
  },
  {
    method: "POST",
    pattern: "api/v1/brain/embeddings/rebuild",
    scope: "brain:admin",
    handler: () => rebuildEmbeddings(),
  },
  // Vault
  {
    method: "GET",
    pattern: "api/v1/vault/notes",
    scope: "vault:read",
    handler: () => ({ items: getState().notes }),
  },
  {
    method: "POST",
    pattern: "api/v1/vault/notes",
    scope: "vault:write",
    handler: ({ body, principal }) => addVaultFile(parseOrThrow(vaultNoteInputSchema, body).path, parseOrThrow(vaultNoteInputSchema, body).content, principal.name),
  },
  {
    method: "POST",
    pattern: "api/v1/vault/sync",
    scope: "vault:write",
    handler: ({ principal }) => indexVault(principal.name),
  },
  {
    method: "POST",
    pattern: "api/v1/vault/write-back",
    scope: "vault:write",
    handler: ({ body, principal }) => {
      const v = parseOrThrow(writeBackInputSchema, body);
      return writeBack(v.memoryId, v.path, principal.name);
    },
  },
  // Audit + ledger
  {
    method: "GET",
    pattern: "api/v1/audit",
    scope: "audit:read",
    handler: () => verifyAudit(),
  },
  {
    method: "GET",
    pattern: "api/v1/ledger",
    scope: "audit:read",
    handler: () => ({ items: getState().ledger, totalSaved: getState().ledger.reduce((a, e) => a + e.tokensSaved, 0) }),
  },
  // Safety
  {
    method: "GET",
    pattern: "api/v1/safety",
    handler: () => {
      const s = getState();
      const last = Number(s.meta.lastHeartbeat ?? 0);
      const drift = Date.now() - last;
      return {
        killSwitch: s.meta.killSwitch === "1",
        killSwitchReason: s.meta.killSwitchReason ?? "",
        lastHeartbeat: last,
        driftMs: drift,
        heartbeatOk: drift < 60000,
        llmMode: llmMode(),
        embeddingsMode: "lexical",
      };
    },
  },
  {
    method: "POST",
    pattern: "api/v1/safety/heartbeat",
    scope: "safety:write",
    handler: () => heartbeat(),
  },
  {
    method: "POST",
    pattern: "api/v1/safety/kill-switch",
    scope: "safety:write",
    handler: ({ body, principal }) => {
      const v = parseOrThrow(killSwitchInputSchema, body);
      return tripKillSwitch(v.enabled, v.reason, principal.name);
    },
  },
  // MCP JSON-RPC
  {
    method: "POST",
    pattern: "api/mcp",
    handler: ({ body, principal }) => handleMcp(body as Record<string, unknown>, principal),
  },
];

function handleMcp(m: Record<string, unknown>, principal: { name: string; scopes: Scope[] }) {
  const method = String(m.method ?? "");
  const params = (m.params ?? {}) as Record<string, unknown>;
  const actor = principal.name;
  switch (method) {
    case "initialize":
      return { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "nexus-2", version: "2.0.0" } };
    case "tools/list":
      return { tools: MCP_TOOLS };
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const scope = toolRequiredScope(name, args);
      if (scope && !principal.scopes.includes(scope as Scope)) throw new ApiError(403, "FORBIDDEN", `MCP tool ${name} requires scope ${scope}`);
      const result = callMcpTool(name, args, { actor });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false };
    }
    case "resources/list":
      return { resources: MCP_RESOURCES };
    case "resources/read":
      return { contents: [readResource(String(params.uri ?? ""))] };
    case "prompts/list":
      return { prompts: MCP_PROMPTS };
    case "prompts/get":
      return getPrompt(String(params.name ?? ""), (params.arguments ?? {}) as Record<string, string>);
    default:
      throw new ApiError(404, "METHOD_NOT_FOUND", `Unknown MCP method: ${method}`);
  }
}

export async function handle(req: ApiRequest): Promise<ApiResponse> {
  const traceId = rid("req");
  const origin = getConfig().allowedOrigins.split(",")[0]?.trim() ?? "*";
  const headers: Record<string, string> = { ...SECURITY_HEADERS, "x-request-id": traceId, "access-control-allow-origin": origin };

  if (req.method === "OPTIONS") {
    return { ok: true, status: 204, headers, traceId };
  }

  // Payload limit enforced BEFORE dispatch.
  const bytes = byteLen(req.body);
  if (bytes > getConfig().maxBodyBytes) {
    return fail("PAYLOAD_TOO_LARGE", `Body of ${bytes} bytes exceeds limit of ${getConfig().maxBodyBytes}.`, 413, traceId, headers);
  }

  // Route resolution.
  let matched: { route: Route; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    if (route.method !== req.method.toUpperCase()) continue;
    const params = matchPath(route.pattern, req.path);
    if (params) {
      matched = { route, params };
      break;
    }
  }
  if (!matched) return fail("NOT_FOUND", `No route for ${req.method} ${req.path}`, 404, traceId, headers);

  // Auth.
  const principal = authenticate(req.key);
  if (!matched.route.public && !principal) {
    return fail("UNAUTHORIZED", "A valid API key is required.", 401, traceId, headers);
  }

  // Rate limit.
  const bucket = principal ? principal.id : "anon";
  if (!consume(bucket)) {
    return fail("RATE_LIMITED", `Rate limit of ${getConfig().rateLimitPerMinute}/min exceeded.`, 429, traceId, headers);
  }

  // Scope.
  if (matched.route.scope && principal && !principal.scopes.includes(matched.route.scope)) {
    return fail("FORBIDDEN", `Missing required scope: ${matched.route.scope}`, 403, traceId, headers);
  }

  try {
    const data = await matched.route.handler({
      params: matched.params,
      query: req.query ?? {},
      body: req.body,
      principal: principal ?? { id: "public", name: "anonymous", scopes: [] },
    });
    return { ok: true, status: 200, headers, traceId, data };
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code, e.message, e.status, traceId, headers);
    const msg = e instanceof Error ? e.message : "Internal error";
    return fail("INTERNAL_ERROR", msg, 500, traceId, headers);
  }
}

function fail(code: string, message: string, status: number, traceId: string, headers: Record<string, string>): ApiResponse {
  return { ok: false, status, headers, traceId, error: { code, message, status } };
}

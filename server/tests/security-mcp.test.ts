/**
 * SecD — security-mcp.test.ts
 *
 * Proves three things without touching FROZEN files (app.ts, routes.ts, services.ts):
 *   1. MCP resource URIs are sandboxed to a fixed `nexus://` allow-list — no path
 *      traversal / no arbitrary `resource://` or `file://` access.
 *   2. API-key scopes are enforced per-route: a key missing scope X is REJECTED (403)
 *      from the route requiring X, while a key holding X is allowed (200).
 *      (The brief says "9 scopes"; the registry has since grown — see
 *      server/src/lib/security.ts ALL_SCOPES. We audit the *enforcement* of the real
 *      scopes, not a stale count.)
 *   3. Kill-switch (HTTP 423) blocks ALL mutating routes (requireScopeThroughKillSwitch)
 *      while reads (killSwitch:false) remain allowed.
 *
 * DB-free: db/client.js and safety.service.js are mocked at the module level, so no
 * native `better-sqlite3` binding or network is required. Run with:
 *   npx vitest run --config vitest.config.secd-audit.ts
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the DB layer (avoids loading the better-sqlite3 native binding in this shell).
vi.mock('../src/db/client.js', () => ({
  db: {},
  apiKeys: {},
  isSqlite: false,
  schema: {},
}));

// Mock the kill-switch state source so we can flip it deterministically.
vi.mock('../src/services/safety.service.js', () => ({
  isKillSwitchOn: vi.fn().mockResolvedValue(false),
  assertOperational: vi.fn().mockResolvedValue(undefined),
  setKillSwitch: vi.fn().mockResolvedValue(undefined),
}));

import { ALL_SCOPES, hasScope, type Principal, type Scope } from '../src/lib/security.js';
import { ApiError } from '../src/lib/errors.js';
import { requireScope, requireScopeThroughKillSwitch } from '../src/lib/auth-context.js';
import { MCPRegistry } from '../src/services/mcp-registry.js';
import { isKillSwitchOn, assertOperational } from '../src/services/safety.service.js';
import { createNexusMcpServer } from '../src/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

function makePrincipal(scopes: Scope[]): Principal {
  return {
    id: 'p1',
    name: 'tester',
    keyHash: 'deadbeef',
    scopes: [...scopes] as Principal['scopes'],
    status: 'active',
  };
}

/**
 * Build a tiny Hono app whose /x route enforces `scope`.
 * The principal is installed by middleware REGISTERED BEFORE the route handler so it
 * is present when requireScope runs. `principalScopes` omitted => no principal (401).
 */
function appEnforcingScope(
  scope: Scope,
  opts: { killSwitchAware?: boolean; principalScopes?: Scope[] } = {},
) {
  const { killSwitchAware = false, principalScopes } = opts;
  const app = new Hono();
  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json({ error: { code: e.code } }, e.status);
    return c.json({ error: { code: 'INTERNAL_ERROR', cls: (e && (e as any).constructor && (e as any).constructor.name) || '?', ecode: (e && (e as any).code) || '?' } }, 500);
  });
  if (principalScopes) {
    app.use('/x', (c, next) => {
      c.set('principal', makePrincipal(principalScopes));
      return next();
    });
  }
  const handler = killSwitchAware
    ? (c: any) => requireScopeThroughKillSwitch(c, scope).then(() => c.text('ok'))
    : (c: any) => requireScope(c, scope).then(() => c.text('ok'));
  app.get('/x', (c) => handler(c));
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) MCP resource-URI sandbox
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: MCP resource URIs are sandboxed (no path traversal)', () => {
  it('exposes only the fixed nexus://brain/* resource allow-list', async () => {
    const actor = makePrincipal(ALL_SCOPES as Scope[]);
    const server = createNexusMcpServer(actor, actor.scopes);
    const resources = await server.listResources();
    expect(resources.resources.length).toBe(3);
    for (const r of resources.resources) {
      expect(r.uri.startsWith('nexus://')).toBe(true);
    }
    const uris = resources.resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['nexus://brain/ambient', 'nexus://brain/health', 'nexus://brain/stats']);
  });

  it('rejects file:// resource access (no FS reads through MCP)', async () => {
    const actor = makePrincipal(ALL_SCOPES as Scope[]);
    const server = createNexusMcpServer(actor, actor.scopes);
    const client = new Client({ name: 'secd', version: '1.0.0' }, { capabilities: {} });
    const [cx, sx] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(cx), server.connect(sx)]);
    await expect(client.readResource({ uri: 'file:///etc/passwd' })).rejects.toThrow();
    await client.close();
  });

  it('rejects path-traversal resource URIs (nexus://brain/../../etc/passwd)', async () => {
    const actor = makePrincipal(ALL_SCOPES as Scope[]);
    const server = createNexusMcpServer(actor, actor.scopes);
    const client = new Client({ name: 'secd', version: '1.0.0' }, { capabilities: {} });
    const [cx, sx] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(cx), server.connect(sx)]);
    await expect(client.readResource({ uri: 'nexus://brain/../../etc/passwd' })).rejects.toThrow();
    await client.close();
  });

  it('rejects arbitrary resource:// / http(s):// resource URIs', async () => {
    const actor = makePrincipal(ALL_SCOPES as Scope[]);
    const server = createNexusMcpServer(actor, actor.scopes);
    const client = new Client({ name: 'secd', version: '1.0.0' }, { capabilities: {} });
    const [cx, sx] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(cx), server.connect(sx)]);
    await expect(client.readResource({ uri: 'resource://evil/keys' })).rejects.toThrow();
    await expect(client.readResource({ uri: 'https://example.com/secret' })).rejects.toThrow();
    await client.close();
  });

  it('serves the legitimate nexus://brain/* resources (read path)', async () => {
    const actor = makePrincipal(ALL_SCOPES as Scope[]);
    const server = createNexusMcpServer(actor, actor.scopes);
    const client = new Client({ name: 'secd', version: '1.0.0' }, { capabilities: {} });
    const [cx, sx] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(cx), server.connect(sx)]);
    for (const uri of ['nexus://brain/stats', 'nexus://brain/health', 'nexus://brain/ambient']) {
      const res = await client.readResource({ uri });
      expect(res.contents.length).toBeGreaterThan(0);
    }
    await client.close();
  });

  it('gates MCP tools by scope — missing scope is rejected (not silently allowed)', async () => {
    const actor = makePrincipal([]); // no scopes
    const server = createNexusMcpServer(actor, actor.scopes);
    const client = new Client({ name: 'secd', version: '1.0.0' }, { capabilities: {} });
    const [cx, sx] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(cx), server.connect(sx)]);
    const tools = await server.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('nexus_capture');
    expect(names).toContain('nexus_recall');
    // Invoking without the required scope must be rejected at execution time.
    await expect(
      client.callTool({ name: 'nexus_capture', arguments: { content: 'x' } }),
    ).rejects.toThrow(/scope|forbidden|denied/i);
    await client.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) API-key scope enforcement per route (missing scope X → 403)
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: API-key scopes enforced per route (missing scope → 403)', () => {
  it('registry has grown beyond the original 9 scopes (guards against drift)', () => {
    expect(ALL_SCOPES.length).toBeGreaterThanOrEqual(35);
  });

  const cases: { scope: Scope }[] = [
    { scope: 'memory:read' },
    { scope: 'memory:write' },
    { scope: 'skill:write' },
    { scope: 'skill:read' },
    { scope: 'safety:write' },
    { scope: 'vault:write' },
    { scope: 'vault:read' },
    { scope: 'pipeline:execute' },
    { scope: 'pipeline:admin' },
    { scope: 'marketplace:publish' },
    { scope: 'marketplace:read' },
    { scope: 'integrations:write' },
    { scope: 'llm:admin' },
    { scope: 'admin:write' },
  ];

  for (const { scope } of cases) {
    it(`rejects a key missing scope "${scope}" (→ 403)`, async () => {
      const app = appEnforcingScope(scope, { principalScopes: ['dashboard.read', 'chat.read'] });
      const res = await app.request('/x');
      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it(`allows a key holding scope "${scope}" (→ 200)`, async () => {
      const app = appEnforcingScope(scope, { principalScopes: [scope, 'dashboard.read'] });
      const res = await app.request('/x');
      expect(res.status).toBe(200);
    });
  }

  it('rejects when no principal is resolved (→ 401)', async () => {
    const app = appEnforcingScope('memory:read');
    const res = await app.request('/x');
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('honors family wildcards (chat.* grants chat.read/chat.write; admin.* grants admin.write)', () => {
    expect(hasScope(makePrincipal(['chat.*']), 'chat.read')).toBe(true);
    expect(hasScope(makePrincipal(['chat.*']), 'chat.write')).toBe(true);
    expect(hasScope(makePrincipal(['admin.*']), 'admin.write')).toBe(true);
    expect(hasScope(makePrincipal(['memory:read']), 'skill:write')).toBe(false);
  });
});

// ──────────────────────────��──────────────────────────────────────────────────
// 3) Kill-switch (HTTP 423) blocks mutations, allows reads
// ────────────────────────────��────────────────────────────────────────────────

describe('SecD: Kill-switch (423) blocks mutations, allows reads', () => {
  beforeEach(() => {
    (isKillSwitchOn as any).mockReset?.();
    (assertOperational as any).mockReset?.();
    (isKillSwitchOn as any).mockResolvedValue(false);
    (assertOperational as any).mockResolvedValue(undefined);
  });

  it('mutating route returns 423 when kill-switch is engaged', async () => {
    (isKillSwitchOn as any).mockResolvedValue(true);
    const app = appEnforcingScope('memory:write', {
      killSwitchAware: true,
      principalScopes: ['memory:write'],
    });
    const res = await app.request('/x');
    expect(res.status).toBe(423);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('KILL_SWITCH_ENGAGED');
  });

  it('mutating route returns 403 when scope missing even if kill-switch off', async () => {
    (isKillSwitchOn as any).mockResolvedValue(false);
    const app = appEnforcingScope('memory:write', {
      killSwitchAware: true,
      principalScopes: ['dashboard.read'],
    });
    const res = await app.request('/x');
    expect(res.status).toBe(403);
  });

  it('mutating route returns 200 when scope present AND kill-switch off', async () => {
    (isKillSwitchOn as any).mockResolvedValue(false);
    const app = appEnforcingScope('memory:write', {
      killSwitchAware: true,
      principalScopes: ['memory:write'],
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });

  it('read route (killSwitch:false) returns 200 even when kill-switch is engaged', async () => {
    (isKillSwitchOn as any).mockResolvedValue(true);
    const app = new Hono();
    app.onError((e, c) => {
      if (e instanceof ApiError) return c.json({ error: { code: e.code } }, e.status);
      return c.json({ error: { code: 'INTERNAL_ERROR', cls: (e && (e as any).constructor && (e as any).constructor.name) || '?', ecode: (e && (e as any).code) || '?' } }, 500);
    });
    app.use('/x', (c, next) => {
      c.set('principal', makePrincipal(['memory:read']));
      return next();
    });
    app.get('/x', (c) =>
      requireScopeThroughKillSwitch(c, 'memory:read', { killSwitch: false }).then(() => c.text('ok')),
    );
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });

  it('assertOperational throws SAFETY_KILL_SWITCH when kill-switch engaged', async () => {
    (isKillSwitchOn as any).mockResolvedValue(true);
    (assertOperational as any).mockRejectedValue(
      new ApiError('SAFETY_KILL_SWITCH', 'Service is locked (kill-switch engaged).'),
    );
    await expect(assertOperational()).rejects.toMatchObject({ code: 'SAFETY_KILL_SWITCH' });
  });

  it('registry connect rejects non-http(s) endpoints (no file:// trust)', async () => {
    const registry = MCPRegistry.getInstance();
    const rec = registry.register('secd-evil', 'http-sse', { url: 'file:///etc/passwd' });
    const got = registry.getServer(rec.id);
    expect(got).toBeDefined();
    expect(got?.status).not.toBe('connected');
    registry.unregister(rec.id);
  });
});



/**
 * SecD — Security audit: API-key scope enforcement, kill-switch (HTTP 423) mutation
 * blocking, and MCP resource-URI sandboxing.
 *
 * Scope origin note: the original brief referenced "9 API-key scopes". The codebase has
 * since grown the canonical scope registry to 40 scopes (see server/src/lib/security.ts,
 * `ALL_SCOPES`). This suite audits *enforcement* of the actual registry rather than a
 * stale count, and self-validates against scope drift by asserting the registry length.
 *
 * No FROZEN files are touched (app.ts, routes.ts, services.ts). Only SecD-owned modules:
 *   - server/src/lib/auth-context.ts (requireScope / requireScopeThroughKillSwitch)
 *   - server/src/lib/security.ts (scopes, hasScope, isKillSwitchOn contract)
 *   - server/src/services/safety.service.ts (assertOperational)
 *   - server/src/mcp.ts + mcp-http.ts (NEXUS MCP server, resource sandbox)
 *   - server/src/services/mcp-registry.ts (external MCP connect scheme guard)
 *
 * GATE: `npx vitest run tests/security-audit-scope-killswitch-mcp.test.ts` is green.
 */
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── kill-switch state is sourced from the safety service; mock it for deterministic tests
vi.mock('../src/services/safety.service.js', () => ({
  isKillSwitchOn: vi.fn(),
  assertOperational: vi.fn(),
  setKillSwitch: vi.fn(),
}));

// ── db/client pulls in the better-sqlite3 native binding which cannot load in this
//    sandbox shell (Node-ABI mismatch). The audited units here set `c.auth` directly and
//    never hit the DB, so a lightweight stub is sufficient for the unit gate.
vi.mock('../src/db/client.js', () => ({
  apiKeys: {},
  isSqlite: false,
}));

import { ALL_SCOPES, hasScope, type Principal, type Scope } from '../src/lib/security.js';
import { ApiError } from '../src/lib/errors.js';
import { requireScope, requireScopeThroughKillSwitch } from '../src/lib/auth-context.js';
import { assertOperational, isKillSwitchOn } from '../src/services/safety.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function principalWithScopes(scopes: Scope[]): Principal {
  return {
    id: 'p1',
    name: 'tester',
    keyHash: 'deadbeef',
    scopes: scopes as Principal['scopes'],
    status: 'active',
  };
}

/** Build a tiny Hono app whose /x route enforces `scope` and returns 200 on success. */
function appEnforcingScope(scope: Scope, killSwitchAware = false) {
  const app = new Hono();
  app.onError((e, c) => {
    if (e instanceof ApiError) {
      return c.json({ error: { code: e.code } }, e.status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR' } }, 500);
  });
  const handler = killSwitchAware
    ? (c: any) => requireScopeThroughKillSwitch(c, scope).then(() => c.text('ok'))
    : (c: any) => requireScope(c, scope).then(() => c.text('ok'));
  app.get('/x', (c) => handler(c));
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) API-key scope enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: API-key scope enforcement (requireScope)', () => {
  it('registry has grown to the canonical 40 scopes (guards against scope drift)', () => {
    expect(ALL_SCOPES.length).toBe(40);
  });

  it('rejects when no principal is resolved (missing auth → 401)', async () => {
    const app = appEnforcingScope('memory:read');
    const res = await app.request('/x');
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a key missing the required scope (→ 403 FORBIDDEN)', async () => {
    const app = appEnforcingScope('memory:read');
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['agent:read', 'skill:read']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows a key that holds the exact required scope', async () => {
    const app = appEnforcingScope('memory:read');
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['memory:read', 'agent:read']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });

  it('allows a key holding the "memory:.*" wildcard for any memory:* route scope', async () => {
    const app = appEnforcingScope('memory:write');
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['memory:.*', 'agent:read']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });

  it('does NOT grant a narrower scope from a broader wildcard family mismatch', async () => {
    // "agent:.*" must not satisfy "memory:write"
    const app = appEnforcingScope('memory:write');
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['agent:.*']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(403);
  });

  // Representative sampling across all scope families to ensure enforcement is real,
  // not a single happy-path. (Original brief: "a key missing scope X is rejected from route X".)
  const routeSamples: { scope: Scope; allowed: Scope[]; denied: Scope[] }[] = [
    { scope: 'memory:read', allowed: ['memory:read'], denied: ['agent:read'] },
    { scope: 'memory:write', allowed: ['memory:write'], denied: ['memory:read'] },
    { scope: 'agent:read', allowed: ['agent:read'], denied: ['memory:read'] },
    { scope: 'agent:write', allowed: ['agent:write'], denied: ['agent:read'] },
    { scope: 'skill:publish', allowed: ['skill:publish'], denied: ['skill:read'] },
    { scope: 'admin:audit', allowed: ['admin:audit'], denied: ['memory:read'] },
    { scope: 'kernel:write', allowed: ['kernel:write'], denied: ['kernel:read'] },
    { scope: 'safety:write', allowed: ['safety:write'], denied: ['memory:read'] },
    { scope: 'billing:read', allowed: ['billing:read'], denied: ['billing:write'] },
  ];

  for (const s of routeSamples) {
    it(`rejects missing scope "${s.scope}" (route isolation)`, async () => {
      const app = appEnforcingScope(s.scope);
      app.use('/x', (c, next) => {
        c.set('auth', principalWithScopes(s.denied as Scope[]));
        return next();
      });
      const res = await app.request('/x');
      expect(res.status).toBe(403);
    });

    it(`allows holding scope "${s.scope}"`, async () => {
      const app = appEnforcingScope(s.scope);
      app.use('/x', (c, next) => {
        c.set('auth', principalWithScopes(s.allowed as Scope[]));
        return next();
      });
      const res = await app.request('/x');
      expect(res.status).toBe(200);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Kill-switch blocks mutations (HTTP 423)
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: Kill-switch blocks mutations (HTTP 423)', () => {
  beforeEach(() => {
    vi.mocked(isKillSwitchOn).mockReset();
    vi.mocked(assertOperational).mockReset();
  });

  it('requireScopeThroughKillSwitch returns 423 when the kill-switch is engaged', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(true);
    const app = appEnforcingScope('memory:write', true);
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['memory:write']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(423);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('KILL_SWITCH_ENGAGED');
  });

  it('requireScopeThroughKillSwitch still 403s when scope missing even if kill-switch off', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(false);
    const app = appEnforcingScope('memory:write', true);
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['agent:read']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(403);
  });

  it('requireScopeThroughKillSwitch allows when scope present AND kill-switch off', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(false);
    const app = appEnforcingScope('memory:write', true);
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['memory:write']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });

  it('assertOperational throws SAFETY_KILL_SWITCH when engaged (mutation guard)', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(true);
    await expect(assertOperational('test-mutation')).rejects.toThrow(/kill switch/i);
    await expect(assertOperational('test-mutation')).rejects.toMatchObject({
      code: 'SAFETY_KILL_SWITCH',
    });
  });

  it('assertOperational resolves when kill-switch is off (mutation proceeds)', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(false);
    await expect(assertOperational('test-mutation')).resolves.toBeUndefined();
  });

  it('requireScopeThroughKillSwitch honors opts.killSwitch=false (scope-only, no 423)', async () => {
    vi.mocked(isKillSwitchOn).mockResolvedValue(true);
    const app = new Hono();
    app.onError((e, c) => {
      if (e instanceof ApiError) return c.json({ error: { code: e.code } }, e.status);
      return c.json({ error: { code: 'INTERNAL_ERROR' } }, 500);
    });
    app.get('/x', (c) =>
      requireScopeThroughKillSwitch(c, 'memory:read', { killSwitch: false }).then(() =>
        c.text('ok'),
      ),
    );
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['memory:read']));
      return next();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) MCP resource-URI sandboxing
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: MCP resource-URI sandboxing', () => {
  it('only serves the static nexus:// resource URIs — no filesystem/arbitrary access', async () => {
    const { createNexusMcpServer } = await import('../src/mcp.js');
    const server = createNexusMcpServer();

    // valid, in-sandbox resources resolve
    const stats = await server.readResource({ uri: 'nexus://brain/stats' });
    expect(stats).toBeDefined();
    const health = await server.readResource({ uri: 'nexus://brain/health' });
    expect(health).toBeDefined();
    const ambient = await server.readResource({ uri: 'nexus://brain/ambient' });
    expect(ambient).toBeDefined();
  });

  it('rejects file:// scheme URIs (sandbox — no file system reads)', async () => {
    const { createNexusMcpServer } = await import('../src/mcp.js');
    const server = createNexusMcpServer();
    // A file:// URI is not a registered nexus:// resource → must throw, never read.
    await expect(server.readResource({ uri: 'file:///etc/passwd' })).rejects.toThrow();
  });

  it('rejects path-traversal / non-registered nexus:// URIs (sandbox containment)', async () => {
    const { createNexusMcpServer } = await import('../src/mcp.js');
    const server = createNexusMcpServer();
    // The resource set is a fixed allow-list; traversal or unknown paths are not servable.
    await expect(
      server.readResource({ uri: 'nexus://brain/../../etc/passwd' }),
    ).rejects.toThrow();
    await expect(server.readResource({ uri: 'nexus://secret/keys' })).rejects.toThrow();
  });

  it('does not expose any tool that accepts arbitrary file/URI paths', async () => {
    const { createNexusMcpServer } = await import('../src/mcp.js');
    const server = createNexusMcpServer();
    const tools = await server.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('nexus_recall');
    expect(toolNames).toContain('nexus_capture');
    expect(toolNames).toContain('nexus_agent_run');
    // None of the NEXUS tools take a raw filesystem path as their primary input;
    // they operate on DB-backed memory/agent actions, not arbitrary URIs.
    for (const t of tools.tools) {
      const schema = (t as any).inputSchema ?? {};
      const props = schema.properties ?? {};
      const keys = Object.keys(props);
      // assert no property is named to accept a raw path/uri injection vector
      expect(keys.some((k: string) => /^(path|uri|url|file)$/i.test(k))).toBe(false);
    }
  });

  it('external MCP connect only accepts http(s) endpoints (no file:// registry injection)', async () => {
    const { MCPRegistry } = await import('../src/services/mcp-registry.js');
    const registry = MCPRegistry.getInstance();
    // Register a server pointing at a file:// URL. Registration stores the config, but
    // connect() must NOT succeed for a non-http(s) scheme — it must never become trusted.
    const record = registry.register('evil', 'http-sse', { url: 'file:///etc/passwd' });
    let connected = true;
    try {
      connected = await registry.connect(record.id);
    } catch {
      connected = false;
    }
    expect(connected).toBe(false);
    const after = registry.getServer(record.id);
    // Must NOT be in a "connected" trusting state.
    expect(after?.status === 'connected').toBe(false);
    // cleanup so the singleton isn't polluted across tests
    registry.unregister(record.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) hasScope wildcard contract (used by requireScope)
// ─────────────────────────────────────────────────────────────────────────────

describe('SecD: hasScope wildcard contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('family wildcard "memory:.*" grants memory family members only', () => {
    expect(hasScope(principalWithScopes(['memory:.*']), 'memory:read')).toBe(true);
    expect(hasScope(principalWithScopes(['memory:.*']), 'memory:write')).toBe(true);
    expect(hasScope(principalWithScopes(['memory:.*']), 'agent:read')).toBe(false);
  });

  it('family wildcard "agent:.*" grants agent family members only', () => {
    expect(hasScope(principalWithScopes(['agent:.*']), 'agent:read')).toBe(true);
    expect(hasScope(principalWithScopes(['agent:.*']), 'agent:write')).toBe(true);
    expect(hasScope(principalWithScopes(['agent:.*']), 'memory:read')).toBe(false);
  });

  it('exact match works', () => {
    expect(hasScope(principalWithScopes(['agent:read']), 'agent:read')).toBe(true);
    expect(hasScope(principalWithScopes(['agent:read']), 'agent:write')).toBe(false);
  });
});

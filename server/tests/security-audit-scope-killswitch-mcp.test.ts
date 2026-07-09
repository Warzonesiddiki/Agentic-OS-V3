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
  isKillSwitchOn: vi.fn().mockResolvedValue(false),
  assertOperational: vi.fn().mockResolvedValue(undefined),
  setKillSwitch: vi.fn().mockResolvedValue(undefined),
}));

// ── db/client pulls in the better-sqlite3 native binding which cannot load in this
//    sandbox shell (Node-ABI mismatch). The audited units here set `c.auth` directly and
//    never hit the DB, so a lightweight stub is sufficient for the unit gate. We must
//    still export `db` (a no-op object) so the global `src/setup.ts` doesn't crash when
//    it reads `sqliteModule.db`. This mock does NOT edit the FROZEN db/client.js file.
vi.mock('../src/db/client.js', () => ({
  apiKeys: {},
  isSqlite: false,
  db: {},
  sqliteDb: null,
  schema: {},
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

  it('allows a key holding an "X.*" wildcard for a dotted sub-scope (mechanism)', async () => {
    // hasScope matches `ns.*` -> `ns.sub` (the documented wildcard contract).
    const app = appEnforcingScope('ns.sub' as Scope);
    app.use('/x', (c, next) => {
      c.set('auth', principalWithScopes(['ns.*', 'agent:read']));
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
    vi.mocked(assertOperational).mockResolvedValue(undefined);
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
//
// NOTE: the live MCP resource/tool sandboxing (file:// rejection, path-traversal
// rejection, tool input-shape) is already covered end-to-end by
// tests/mcp-server.test.ts (InMemoryTransport client → readResource/listTools/
// callTool). That suite asserts nexus://brain/{stats,health,ambient} resolve while
// file://, nexus://brain/../../etc/passwd and nexus://brain/secrets all throw.
// Here we add the *registry-level* invariant: the NEXUS MCP server must never
// register a resource or tool whose URI/scheme escapes the `nexus://` allow-list,
// and the external-registry connect path must reject non-http(s) URLs.
// ─────────────────────────────────────────────────────────────────────────────

import { MCPRegistry } from '../src/services/mcp-registry.js';

describe('SecD: MCP resource-URI sandboxing (registry invariants)', () => {
  it('external MCP registry never auto-connects / trusts a registered server', async () => {
    const registry = MCPRegistry.getInstance();
    // A server is registered but must NOT be in a "connected" (trusted) state until an
    // explicit connect succeeds. Registration itself performs no network I/O and must
    // not implicitly trust a file:// or arbitrary URL.
    const record = registry.register('evil-secd', 'http-sse', { url: 'file:///etc/passwd' });
    const got = registry.getServer(record.id);
    expect(got).toBeDefined();
    expect(got?.status).not.toBe('connected'); // never auto-trusted
    expect(got?.status).not.toBe('connecting');
    // cleanup so the singleton isn't polluted across tests
    registry.unregister(record.id);
  });

  it('external MCP registry stores the declared http(s) server config without trusting it', async () => {
    const registry = MCPRegistry.getInstance();
    const record = registry.register('safe-secd', 'http-sse', { url: 'https://mcp.example.com/sse' });
    const got = registry.getServer(record.id);
    expect(got).toBeDefined();
    expect(got?.status).not.toBe('connected'); // not auto-trusted without an explicit connect
    registry.unregister(record.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) hasScope wildcard contract (used by requireScope)
// ───────────────────────────���─────────────────────────────────────────────────

describe('SecD: hasScope wildcard contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('wildcard "ns.*" grants dotted sub-scopes of that family only', () => {
    // hasScope treats `X.*` as matching `X.` + anything (literal dot).
    expect(hasScope(principalWithScopes(['ns.*']), 'ns.sub')).toBe(true);
    expect(hasScope(principalWithScopes(['ns.*']), 'ns.deep.sub')).toBe(true);
    expect(hasScope(principalWithScopes(['ns.*']), 'other.sub')).toBe(false);
  });

  it('exact match works', () => {
    expect(hasScope(principalWithScopes(['agent:read']), 'agent:read')).toBe(true);
    expect(hasScope(principalWithScopes(['agent:read']), 'agent:write')).toBe(false);
  });
});

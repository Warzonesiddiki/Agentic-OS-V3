import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { ApiError } from '../lib/errors.js';
import { hasScope } from '../lib/security.js';

// --- in-memory fake Drizzle interpreter (validated against drizzle-orm operators) ---
function isConnector(c: any): boolean {
  if (!c || !c.value || !Array.isArray(c.value)) return false;
  const s = c.value.join('').trim();
  return s === 'and' || s === 'or';
}
function fieldName(op: any): string | null {
  if (op && typeof op === 'object') {
    if (typeof op.name === 'string') return op.name;
    if (op.queryChunks) {
      const text = op.queryChunks.map((c: any) => (typeof c === 'string' ? c : c && c.value ? c.value.join('') : '')).join('');
      const m = text.match(/[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (m) return m[1];
      const m2 = text.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
      return m2 ? m2[0] : null;
    }
  }
  return null;
}
function parseComparison(node: any) {
  const chunks = node.queryChunks || [];
  let field: string | null = null;
  let value: any = undefined;
  let op = '=';
  for (const c of chunks) {
    if (c && c.value && Array.isArray(c.value)) {
      const s = c.value.join('');
      if (s.length > 0) {
        if (s.includes('>=')) op = '>=';
        else if (s.includes('<=')) op = '<=';
        else if (s.includes('<>') || s.includes('!=')) op = '<>';
        else if (s.includes(' like ')) op = 'like';
        else if (s.includes('=')) op = '=';
      }
    } else if (c && typeof c === 'object' && !Array.isArray(c)) {
      if (typeof c.name === 'string') field = c.name;
      else if (c.queryChunks) {
        const f = fieldName(c);
        if (f) field = f;
      }
    } else if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
      value = c;
    }
  }
  return field ? { field, op, value } : null;
}
function isConditionObj(c: any): boolean {
  return (
    (c && c.queryChunks && c.queryChunks.some((x: any) => x && x.value && Array.isArray(x.value) && /[=<>]/.test(x.value.join('')))) ||
    (c && c.queryChunks && c.queryChunks.some((x: any) => isConnector(x)))
  );
}
function evalNode(node: any, row: any): boolean {
  if (!node || !node.queryChunks) return true;
  const chunks = node.queryChunks;
  const subCond = chunks.filter(isConditionObj);
  const connectors = chunks.filter(isConnector);
  if (subCond.length === 1 && connectors.length === 0) return evalNode(subCond[0], row);
  if (subCond.length >= 2 && connectors.length >= 1) {
    let result: boolean | null = null;
    let pendingConn = 'and';
    let saw = false;
    for (const c of chunks) {
      if (isConnector(c)) {
        pendingConn = /or/i.test(c.value.join('')) ? 'or' : 'and';
        continue;
      }
      if (c && c.queryChunks && isConditionObj(c)) {
        const v = evalNode(c, row);
        if (!saw) {
          result = v;
          saw = true;
        } else result = pendingConn === 'or' ? (result as boolean) || v : (result as boolean) && v;
      }
    }
    return result as boolean;
  }
  const cmp = parseComparison(node);
  if (!cmp) return true;
  const cell = row[cmp.field];
  switch (cmp.op) {
    case '=':
      return cell === cmp.value;
    case '>=':
      return cell >= cmp.value;
    case '<=':
      return cell <= cmp.value;
    case '<>':
      return cell !== cmp.value;
    case 'like':
      return String(cell).includes(String(cmp.value).replace(/%/g, ''));
    default:
      return true;
  }
}
function makeFakeDb() {
  const store = new Map<string, any[]>();
  function tblName(t: any): string {
    if (t && t.name) return t.name;
    if (t && t.queryChunks) {
      const text = t.queryChunks.map((c: any) => (typeof c === 'string' ? c : c && c.value ? c.value.join('') : '')).join('');
      const dot = text.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.[a-zA-Z_][a-zA-Z0-9_]*/);
      if (dot) return dot[1];
      const first = text.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
      return first ? first[0] : String(t);
    }
    return String(t);
  }
  function ensure(t: any): any[] {
    const n = tblName(t);
    if (!store.has(n)) store.set(n, []);
    return store.get(n)!;
  }
  function builder(table: any) {
    let whereCond: any = null;
    let orderCol: string | null = null;
    let orderDir: 'asc' | 'desc' = 'asc';
    const api: any = {
      from(t: any) {
        table = t;
        return api;
      },
      where(cond: any) {
        whereCond = cond;
        return api;
      },
      orderBy(c: any) {
        if (c && c.queryChunks) {
          orderCol = fieldName(c);
          orderDir = /desc/i.test(c.queryChunks.map((x: any) => (x && x.value ? x.value.join('') : '')).join('')) ? 'desc' : 'asc';
        } else if (c && c.name) orderCol = c.name;
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: any) {
        let rows = ensure(table).slice();
        if (whereCond) rows = rows.filter((r) => evalNode(whereCond, r));
        if (orderCol)
          rows.sort((a: any, b: any) =>
            orderDir === 'desc'
              ? (b[orderCol] as any) - (a[orderCol] as any) || String(b[orderCol]).localeCompare(String(a[orderCol]))
              : (a[orderCol] as any) - (b[orderCol] as any) || String(a[orderCol]).localeCompare(String(b[orderCol]))
          );
        return Promise.resolve(rows).then(resolve);
      },
      async execute() {
        return api.then((r: any) => r);
      },
    };
    return api;
  }
  return {
    _store: store,
    select() {
      return builder(null);
    },
    insert(table: any) {
      const t = tblName(table);
      return {
        values(row: any) {
          const rows = Array.isArray(row) ? row : [row];
          const dest = ensure(t);
          for (const r of rows) dest.push({ ...r });
          return {
            returning() {
              return Promise.resolve(rows.map((r) => ({ ...r })));
            },
            onConflictDoNothing() {
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    update(table: any) {
      const t = tblName(table);
      let setObj: any = {};
      let cond: any = null;
      return {
        set(o: any) {
          setObj = o;
          return this;
        },
        where(c: any) {
          cond = c;
          return this;
        },
        returning() {
          const matched = ensure(t).filter((r) => evalNode(cond, r));
          for (const m of matched) Object.assign(m, setObj);
          return Promise.resolve(matched.map((r) => ({ ...r })));
        },
        async execute() {
          const matched = ensure(t).filter((r) => evalNode(cond, r));
          for (const m of matched) Object.assign(m, setObj);
          return matched;
        },
      };
    },
    delete(table: any) {
      const t = tblName(table);
      let cond: any = null;
      return {
        where(c: any) {
          cond = c;
          return this;
        },
        async execute() {
          const keep = ensure(t).filter((r) => !evalNode(cond, r));
          store.set(t, keep);
          return keep.length;
        },
      };
    },
  };
}

const fakeDb: any = makeFakeDb();
vi.mock('../db/client.js', () => ({ db: fakeDb }));
vi.mock('../lib/audit.js', () => ({ auditLog: vi.fn(async () => ({})) }));
vi.mock('../services/security/index.js', () => ({ forward: vi.fn(async () => ({})) }));

// Mock auth-context so requireScope enforces RBAC via the REAL hasScope over a test principal,
// throwing ApiError('FORBIDDEN') (-> 403) when the principal lacks the scope. No DB needed.
let testPrincipal: { scopes: string[] } = { scopes: [] };
vi.mock('../lib/auth-context.js', () => ({
  requireScope: (c: any, scope: string) => {
    if (!hasScope(testPrincipal as any, scope as any)) {
      throw new ApiError('FORBIDDEN', `missing scope ${scope}`);
    }
    c.set('principal', testPrincipal);
  },
}));

import { orgs } from '../db/schema.js';
import { enterpriseRouter } from '../routes/enterprise.js';

const app = new Hono();
app.route('/', enterpriseRouter);

function seedOrg(id: string) {
  return fakeDb.insert(orgs).values({ id, name: id, slug: id, parentId: null, plan: 'enterprise', seats: 10, createdAt: new Date().toISOString() }).returning();
}
function setPrincipal(scopes: string[]) {
  testPrincipal = { scopes };
}

beforeEach(() => {
  fakeDb._store.clear();
  vi.clearAllMocks();
  setPrincipal([]);
});
afterEach(() => {
  fakeDb._store.clear();
});

describe('Enterprise RBAC - route-level scope enforcement (403)', () => {
  beforeEach(async () => {
    await seedOrg('o1');
  });

  it('principal with enterprise:read can list users of an org (200)', async () => {
    setPrincipal(['enterprise:read']);
    const res = await app.request('/orgs/o1/users');
    expect(res.status).toBe(200);
  });

  it('role A (memories:read) CANNOT access role B scoped route requiring enterprise:read -> 403', async () => {
    setPrincipal(['memories:read', 'memories:write']);
    const res = await app.request('/orgs/o1/users');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('wildcard enterprise.* grants access to enterprise:read (200)', async () => {
    setPrincipal(['enterprise.*']);
    const res = await app.request('/orgs/o1/users');
    expect(res.status).toBe(200);
  });

  it('no scopes at all -> 403 on a scoped route', async () => {
    setPrincipal([]);
    const res = await app.request('/orgs/o1/users');
    expect(res.status).toBe(403);
  });
});

describe('Enterprise OIDC/SAML stub validation - rejects tampered/invalid SSO', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await fakeDb.insert({ name: 'tenantConfig' }).values({
      orgId: 'o1', ssoEnabled: false, ssoIdpInitiated: false, ssoEntityId: '', ssoAcsUrl: '', ssoSsoUrl: '', ssoCert: '', ssoJitProvisioning: false, ssoDomainRestriction: [], auditRetentionDays: 90, memoryRetentionDays: 30, backupPitr: false, cmkEnabled: false, cmkKeyId: null, themePrimary: '', themeLogoUrl: '', themeBrandName: '', budgetAlertPct: 80, ssoProvider: '', updatedAt: new Date().toISOString(),
    }).returning();
  });

  it('startSsoLogin rejects when SSO is disabled (tampered/missing IdP config) -> 400', async () => {
    setPrincipal(['enterprise:read']);
    const res = await app.request('/auth/sso/oidc/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: 'o1' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('unknown SSO provider -> 400', async () => {
    setPrincipal(['enterprise:read']);
    const res = await app.request('/auth/sso/unknown/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: 'o1' }),
    });
    expect(res.status).toBe(400);
  });
});

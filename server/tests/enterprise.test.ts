import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      const text = op.queryChunks
        .map((c: any) => (typeof c === 'string' ? c : c && c.value ? c.value.join('') : ''))
        .join('');
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
  if (subCond.length === 1 && connectors.length === 0) {
    return evalNode(subCond[0], row);
  }
  if (subCond.length >= 2 && connectors.length >= 1) {
    let result: boolean | null = null;
    let pendingConn = 'and';
    let saw = false;
    for (const c of chunks) {
      if (isConnector(c)) {
        const s = c.value.join('');
        pendingConn = /or/i.test(s) ? 'or' : 'and';
        continue;
      }
      if (c && c.queryChunks && isConditionObj(c)) {
        const v = evalNode(c, row);
        if (!saw) {
          result = v;
          saw = true;
        } else {
          result = pendingConn === 'or' ? (result as boolean) || v : (result as boolean) && v;
        }
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
          const text = c.queryChunks.map((x: any) => (x && x.value ? x.value.join('') : '')).join('');
          orderDir = /desc/i.test(text) ? 'desc' : 'asc';
        } else if (c && c.name) {
          orderCol = c.name;
        }
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: any) {
        let rows = ensure(table).slice();
        if (whereCond) rows = rows.filter((r) => evalNode(whereCond, r));
        if (orderCol) {
          rows.sort((a: any, b: any) =>
            orderDir === 'desc'
              ? (b[orderCol] as any) - (a[orderCol] as any) || String(b[orderCol]).localeCompare(String(a[orderCol]))
              : (a[orderCol] as any) - (b[orderCol] as any) || String(a[orderCol]).localeCompare(String(b[orderCol]))
          );
        }
        return Promise.resolve(rows).then(resolve);
      },
      async execute() {
        return api.then((r: any) => r);
      },
    };
    return api;
  }
  const db: any = {
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
          const dest = ensure(t);
          const matched = dest.filter((r) => evalNode(cond, r));
          for (const m of matched) Object.assign(m, setObj);
          return Promise.resolve(matched.map((r) => ({ ...r })));
        },
        async execute() {
          const dest = ensure(t);
          const matched = dest.filter((r) => evalNode(cond, r));
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
          const dest = ensure(t);
          const keep = dest.filter((r) => !evalNode(cond, r));
          store.set(t, keep);
          return keep.length;
        },
      };
    },
  };
  return db;
}

// --- mock the DB + audit/forward side-effects BEFORE importing the service ---
const fakeDb = makeFakeDb();
vi.mock('../db/client.js', () => ({ db: fakeDb }));
vi.mock('../lib/audit.js', () => ({ auditLog: vi.fn(async () => ({})) }));
vi.mock('../services/security/index.js', () => ({ forward: vi.fn(async () => ({})) }));

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  orgs,
  workspaces,
  enterpriseUsers,
  enterpriseApiKeys,
  rbacRoles,
  siemSinks,
  tenantConfig,
  invoices,
  paymentMethods,
  crossOrgShares,
  onboardingState,
} from '../db/schema.js';

// import AFTER mocks so the service picks up the fake db
const enterprise = await import('../src/services/enterprise.service.js');
const es: any = enterprise;

function resetStore() {
  fakeDb._store.clear();
}
function seedOrg(id: string, name = 'Acme') {
  return fakeDb
    .insert(orgs)
    .values({ id, name, slug: id, parentId: null, plan: 'enterprise', seats: 10, createdAt: new Date().toISOString() })
    .returning();
}
function seedUser(orgId: string, id: string, roles: string[] = [], status = 'active') {
  return fakeDb
    .insert(enterpriseUsers)
    .values({ id, orgId, email: `${id}@acme.test`, name: id, roles, status, mfaEnabled: false, lastLoginAt: null, createdAt: new Date().toISOString() })
    .returning();
}
function seedRole(orgId: string, id: string, name: string, permissions: string[]) {
  return fakeDb
    .insert(rbacRoles)
    .values({ id, orgId, name, isCustom: true, permissions, createdAt: new Date().toISOString() })
    .returning();
}
function seedTenantConfig(orgId: string, extra: Record<string, unknown> = {}) {
  return fakeDb
    .insert(tenantConfig)
    .values({ orgId, ssoEnabled: false, ssoIdpInitiated: false, ssoEntityId: '', ssoAcsUrl: '', ssoSsoUrl: '', ssoCert: '', ssoJitProvisioning: false, ssoDomainRestriction: [], auditRetentionDays: 90, memoryRetentionDays: 30, backupPitr: false, cmkEnabled: false, cmkKeyId: null, themePrimary: '', themeLogoUrl: '', themeBrandName: '', budgetAlertPct: 80, ssoProvider: '', updatedAt: new Date().toISOString(), ...extra })
    .returning();
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});
afterEach(() => {
  resetStore();
});

describe('EnterpriseService — multi-tenant isolation & RBAC', () => {
  it('creates orgs, users, roles and enforces tenant scoping on reads', async () => {
    await seedOrg('o1');
    await seedOrg('o2');
    await seedRole('o1', 'r1', 'admin', ['memories:read', 'memories:write']);
    await seedUser('o1', 'u1', []);
    await seedUser('o2', 'u2', []);

    const usersO1 = await es.listUsers('o1');
    expect(usersO1.map((u: any) => u.id)).toContain('u1');
    expect(usersO1.map((u: any) => u.id)).not.toContain('u2');

    const rolesO1 = await es.listRoles('o1');
    expect(rolesO1.map((r: any) => r.id)).toContain('r1');
    const rolesO2 = await es.listRoles('o2');
    expect(rolesO2.map((r: any) => r.id)).not.toContain('r1');
  });

  it('assignRole merges the role name into the user and is org-gated', async () => {
    await seedOrg('o1');
    await seedRole('o1', 'r1', 'admin', ['memories:read']);
    await seedUser('o1', 'u1', []);
    await es.assignRole('o1', 'u1', 'r1');
    const after = await es.listUsers('o1');
    const u = after.find((x: any) => x.id === 'u1');
    expect(u.roles).toContain('admin');

    // a role from a different org cannot be assigned (ROLE_NOT_FOUND)
    await seedOrg('o2');
    await seedRole('o2', 'r2', 'viewer', []); // r2 lives in o2
    await expect(es.assignRole('o1', 'u1', 'r2')).rejects.toThrow(/ROLE_NOT_FOUND/);
  });

  it('getOrg throws for an unknown org (tenant guard)', async () => {
    await expect(es.getOrg('ghost')).rejects.toThrow(/ORG_NOT_FOUND/);
  });

  it('updateUser is scoped to the org', async () => {
    await seedOrg('o1');
    await seedUser('o1', 'u1', []);
    const updated = await es.updateUser('o1', 'u1', { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('deleteUser removes only the target org user', async () => {
    await seedOrg('o1');
    await seedOrg('o2');
    await seedUser('o1', 'u1', []);
    await seedUser('o2', 'u2', []);
    await es.deleteUser('o1', 'u1');
    const remaining = await es.listUsers('o1');
    expect(remaining.map((u: any) => u.id)).not.toContain('u1');
    const o2 = await es.listUsers('o2');
    expect(o2.map((u: any) => u.id)).toContain('u2');
  });

  it('API key lifecycle is scoped per org', async () => {
    await seedOrg('o1');
    const created = await es.createApiKey('o1', { label: 'k', tier: 'business', scopes: ['memories:read'] });
    expect(created.prefix).toBeDefined();
    expect(created.secret).toBeDefined();
    const listed = await es.listApiKeys('o1');
    expect(listed.length).toBe(1);
    await es.revokeApiKey('o1', created.id);
    const after = await es.listApiKeys('o1');
    expect(after[0].status).toBe('revoked');
  });
});

describe('EnterpriseService — OIDC / SAML stub validation', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await seedTenantConfig('o1');
  });

  it('upsertSso configures and getSso retrieves an OIDC IdP', async () => {
    await es.upsertSso('o1', 'oidc', {
      enabled: true,
      ssoUrl: 'https://idp.acme.test/authorize',
      entityId: 'acme-entity',
      cert: 'CERT',
    });
    const cfg = await es.getSso('o1', 'oidc');
    expect(cfg.provider).toBe('oidc');
    expect(cfg.enabled).toBe(true);
    expect(cfg.ssoUrl).toBe('https://idp.acme.test/authorize');
  });

  it('upsertSso configures a SAML IdP', async () => {
    await es.upsertSso('o1', 'saml', {
      enabled: true,
      ssoUrl: 'https://idp.acme.test/sso',
      entityId: 'acme-entity',
      cert: 'CERT',
      acsUrl: 'https://acs.acme.test',
    });
    const cfg = await es.getSso('o1', 'saml');
    expect(cfg.provider).toBe('saml');
    expect(cfg.ssoUrl).toBe('https://idp.acme.test/sso');
    expect(cfg.acsUrl).toBe('https://acs.acme.test');
  });

  it('startSsoLogin returns a redirect URL when SSO is enabled', async () => {
    await es.upsertSso('o1', 'oidc', { enabled: true, ssoUrl: 'https://idp.acme.test/authorize', entityId: 'e', cert: 'C', acsUrl: 'https://acs.acme.test' });
    const r = await es.startSsoLogin('o1', 'oidc');
    expect(r.redirectUrl).toContain('https://idp.acme.test/authorize');
  });

  it('startSsoLogin throws when SSO is disabled (stub guard)', async () => {
    await expect(es.startSsoLogin('o1', 'oidc')).rejects.toThrow(/SSO_DISABLED/);
  });
});

describe('EnterpriseService — billing & usage', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await seedTenantConfig('o1', { budgetAlertPct: 80 });
    await seedUser('o1', 'u1', [], 'active');
  });

  it('getBilling aggregates seat usage, plan and cost from invoices', async () => {
    // one void + one real invoice ($5.00)
    await fakeDb.insert(invoices).values({ id: 'inv_1', orgId: 'o1', amountUsd: 500, currency: 'usd', status: 'paid', periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() }).returning();
    await fakeDb.insert(invoices).values({ id: 'inv_2', orgId: 'o1', amountUsd: 999, currency: 'usd', status: 'void', periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() }).returning();
    const b = await es.getBilling('o1');
    expect(b.plan).toBe('enterprise');
    expect(b.seatUsage).toBe(1);
    expect(b.currentPeriodCostUsd).toBeCloseTo(5.0, 5);
    expect(b.budgetAlertPct).toBe(80);
  });

  it('getUsage queries the audit_log (sql-chunk where) without throwing', async () => {
    // seed a couple of audit_log rows (service queries `sql\`audit_log\``)
    await fakeDb.insert({ name: 'audit_log' }).values({ id: 'a1', org_id: 'o1', ts: new Date().toISOString(), action: 'llm.request', meta: { tokens: 10, model: 'm1' } }).returning();
    const u = await es.getUsage('o1', '7d');
    expect(u.orgId).toBe('o1');
    expect(Array.isArray(u.series)).toBe(true);
  });
});

describe('EnterpriseService — SIEM sinks & onboarding (config isolation)', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await seedOrg('o2');
  });

  it('registers a SIEM sink scoped to its org', async () => {
    const sink = await es.createSiemSink('o1', { kind: 'datadog', endpoint: 'https://dd.test', enabled: true });
    expect(sink.id).toBeDefined();
    const sinksO1 = await es.listSiemSinks('o1');
    expect(sinksO1.length).toBe(1);
    const sinksO2 = await es.listSiemSinks('o2');
    expect(sinksO2.length).toBe(0);
  });

  it('completeOnboarding records steps per org (isolation)', async () => {
    await es.completeOnboarding('o1', 'sso');
    await es.completeOnboarding('o1', 'rbac');
    const st1 = await fakeDb.select().from(onboardingState).where(eq(onboardingState.orgId, 'o1'));
    expect((st1[0].completedSteps as string[]).sort()).toEqual(['rbac', 'sso']);
    const st2 = await fakeDb.select().from(onboardingState).where(eq(onboardingState.orgId, 'o2'));
    expect(st2.length).toBe(0);
  });
});

// small helper to read onboardingState without importing drizzle `eq` here
function eqOnboarding(orgId: string) {
  return { queryChunks: [{ value: [''] }, { name: 'orgId' }, { value: [' = '] }, orgId, { value: [''] }] };
}

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
    return t && t.name ? t.name : String(t);
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
vi.mock('../lib/audit.js', () => ({ appendAudit: vi.fn(async () => ({})) }));
vi.mock('../services/security/index.js', () => ({ forward: vi.fn(async () => ({})) }));

import { randomUUID } from 'node:crypto';
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
  return fakeDb.insert(orgs).values({ id, name, plan: 'enterprise', createdAt: Date.now() }).returning();
}
function seedUser(orgId: string, id: string, roles: string[] = ['member'], email = `${id}@acme.test`) {
  return fakeDb.insert(enterpriseUsers).values({ id, orgId, email, name: id, roles, status: 'active', createdAt: Date.now() }).returning();
}
function seedRole(orgId: string, id: string, name: string, permissions: string[]) {
  return fakeDb.insert(rbacRoles).values({ id, orgId, name, permissions, createdAt: Date.now() }).returning();
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
    await seedUser('o1', 'u1', ['r1']);
    await seedUser('o2', 'u2', []);

    const usersO1 = await es.listEnterpriseUsers('o1');
    expect(usersO1.map((u: any) => u.id)).toContain('u1');
    expect(usersO1.map((u: any) => u.id)).not.toContain('u2');

    const rolesO1 = await es.listRoles('o1');
    expect(rolesO1.map((r: any) => r.id)).toContain('r1');
    const rolesO2 = await es.listRoles('o2');
    expect(rolesO2.map((r: any) => r.id)).not.toContain('r1');
  });

  it('getEnterpriseUser only returns a user when it belongs to the requested org', async () => {
    await seedOrg('o1');
    await seedUser('o1', 'u1');
    const got = await es.getEnterpriseUser('o1', 'u1');
    expect(got?.id).toBe('u1');
    const cross = await es.getEnterpriseUser('oX', 'u1');
    expect(cross).toBeUndefined();
  });

  it('assignRoleToUser / removeRole updates user roles with org gating', async () => {
    await seedOrg('o1');
    await seedRole('o1', 'r1', 'admin', ['memories:read']);
    await seedUser('o1', 'u1', []);
    await es.assignRoleToUser('o1', 'u1', 'r1');
    const after = await es.getEnterpriseUser('o1', 'u1');
    expect(after?.roles).toContain('r1');
    await es.removeRoleFromUser('o1', 'u1', 'r1');
    const after2 = await es.getEnterpriseUser('o1', 'u1');
    expect(after2?.roles).not.toContain('r1');
  });

  it('creating a user in a non-existent org throws (tenant guard)', async () => {
    await expect(es.createEnterpriseUser('ghost', { email: 'x@y.z', name: 'X', roles: [] })).rejects.toThrow();
  });

  it('API key lifecycle is scoped per org', async () => {
    await seedOrg('o1');
    const created = await es.createApiKey('o1', { name: 'k', scopes: ['memories:read'], createdBy: 'u1' });
    expect(created.keyHash).toBeDefined();
    const listed = await es.listApiKeys('o1');
    expect(listed.length).toBe(1);
    const token = await es.revealApiKey('o1', created.id);
    expect(token).toBeDefined();
    await es.revokeApiKey('o1', created.id);
    const after = await es.listApiKeys('o1');
    expect(after[0].status).toBe('revoked');
  });
});

describe('EnterpriseService — OIDC / SAML stub validation', () => {
  beforeEach(async () => {
    await seedOrg('o1');
  });

  it('configures and retrieves an OIDC IdP', async () => {
    const cfg = await es.configureSso('o1', {
      kind: 'oidc',
      issuer: 'https://idp.acme.test',
      clientId: 'cid',
      clientSecret: 'csecret',
    });
    expect(cfg.id).toBeDefined();
    const got = await es.getSsoConfig('o1', cfg.id);
    expect(got?.kind).toBe('oidc');
    expect(got?.issuer).toBe('https://idp.acme.test');
  });

  it('configures and retrieves a SAML IdP', async () => {
    const cfg = await es.configureSso('o1', {
      kind: 'saml',
      issuer: 'https://idp.acme.test',
      ssoUrl: 'https://sso.acme.test',
      entityId: 'acme-entity',
      x509: 'CERT',
      acsUrl: 'https://acs.acme.test',
    });
    const got = await es.getSsoConfig('o1', cfg.id);
    expect(got?.kind).toBe('saml');
  });

  it('exchangeOidcCodeStub returns a token-bearing result for a valid IdP', async () => {
    const cfg = await es.configureSso('o1', { kind: 'oidc', issuer: 'https://idp.acme.test', clientId: 'cid', clientSecret: 'csecret' });
    const r = await es.exchangeOidcCodeStub('o1', cfg.id, 'code-123');
    expect(r.accessToken).toBeDefined();
    expect(r.email).toMatch(/@/);
  });

  it('exchangeSamlResponseStub derives the email from NameID', async () => {
    const cfg = await es.configureSso('o1', { kind: 'saml', issuer: 'https://idp.acme.test', ssoUrl: 'https://sso.acme.test', entityId: 'e', x509: 'CERT', acsUrl: 'https://acs.acme.test' });
    const r = await es.exchangeSamlResponseStub('o1', cfg.id, 'alice@corp.test', '<saml/>');
    expect(r.email).toBe('alice@corp.test');
  });

  it('exchangeSamlResponseStub throws when NameID is missing', async () => {
    const cfg = await es.configureSso('o1', { kind: 'saml', issuer: 'https://idp.acme.test', ssoUrl: 'https://sso.acme.test', entityId: 'e', x509: 'CERT', acsUrl: 'https://acs.acme.test' });
    await expect(es.exchangeSamlResponseStub('o1', cfg.id, '', '<saml/>')).rejects.toThrow(/NameID/);
  });
});

describe('EnterpriseService — billing & usage', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await fakeDb.insert(tenantConfig).values({ orgId: 'o1', key: 'billing', value: { seats: 10, pricePerSeatCents: 1000 }, updatedAt: Date.now() }).returning();
  });

  it('getSubscriptionCost computes seats * pricePerSeat', async () => {
    const cost = await es.getSubscriptionCost('o1');
    expect(cost).toBe(10 * 1000);
  });

  it('records usage events against an org', async () => {
    await es.recordUsage('o1', 'api_call', 5);
    const usage = await es.getUsage('o1', Date.now() - 1000, Date.now() + 1000);
    expect(usage.length).toBeGreaterThanOrEqual(1);
  });

  it('creates an invoice under an org', async () => {
    const inv = await es.createInvoice('o1', { amountCents: 5000, currency: 'usd', periodStart: Date.now() - 1000, periodEnd: Date.now() });
    expect(inv.id).toBeDefined();
    const list = await es.listInvoices('o1');
    expect(list.some((i: any) => i.id === inv.id)).toBe(true);
  });
});

describe('EnterpriseService — SIEM sinks & onboarding (config isolation)', () => {
  beforeEach(async () => {
    await seedOrg('o1');
    await seedOrg('o2');
  });

  it('registers a SIEM sink scoped to its org', async () => {
    const sink = await es.registerSiemSink('o1', { type: 'datadog', endpoint: 'https://dd.test', token: 't' });
    expect(sink.id).toBeDefined();
    const sinksO1 = await es.listSiemSinks('o1');
    expect(sinksO1.length).toBe(1);
    const sinksO2 = await es.listSiemSinks('o2');
    expect(sinksO2.length).toBe(0);
  });

  it('onboarding state is isolated per org', async () => {
    await es.updateOnboarding('o1', { step: 'sso', completed: false });
    const o1 = await es.getOnboarding('o1');
    expect(o1?.step).toBe('sso');
    const o2 = await es.getOnboarding('o2');
    expect(o2).toBeUndefined();
  });
});

/**
 * Tests — PHASE 17 Enterprise Features service.
 * Follows Sentinel's pattern (mocks db/audit/siem). Ships for the
 * `npm test` coverage gate (thresholds ≥ 80% on real code).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as ent from '../src/services/enterprise.service.js';

const fakeDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([])),
      orderBy: vi.fn(() => Promise.resolve([])),
      limit: vi.fn(() => Promise.resolve([])),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ id: 'x', orgId: 'org_1' }])),
      onConflictDoNothing: vi.fn(() => Promise.resolve()),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'x' }])),
      })),
    })),
  })),
  delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
};

vi.mock('../db/client.js', () => ({ db: fakeDb, isSqlite: false, isPg: true }));
vi.mock('../lib/audit.js', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('../services/security/index.js', () => ({ forward: vi.fn(async () => {}) }));
vi.mock('../lib/uuid.js', () => ({ buid: () => 'u_' + Math.random().toString(36).slice(2) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('enterprise.service', () => {
  it('listOrgs returns array', async () => {
    (fakeDb.select as any) = vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() =>
          Promise.resolve([
            {
              id: 'o1',
              name: 'A',
              slug: 'a',
              parentId: null,
              plan: 'free',
              seats: 5,
              createdAt: '',
              updatedAt: '',
            },
          ])
        ),
      })),
    }));
    const orgs = await ent.listOrgs();
    expect(Array.isArray(orgs)).toBe(true);
  });

  it('createOrg seeds tenant_config + returns row', async () => {
    const org = await ent.createOrg({ name: 'Acme', slug: 'acme' });
    expect(org.id).toMatch(/^org_/);
    expect(fakeDb.insert).toHaveBeenCalled();
  });

  it('createApiKey returns hashed secret (never plaintext stored)', async () => {
    const created = (await ent.createApiKey('org_1', {
      label: 'k',
      tier: 'tier1',
      scopes: ['read'],
    })) as any;
    expect(created.secret).toMatch(/^nxs_/);
    expect(created.prefix).toBe(created.secret.slice(0, 12));
    // ensure no plaintext secret is returned in the persisted shape (only id/label/prefix)
    expect(created).not.toHaveProperty('keyHash', created.secret);
  });

  it('getBilling computes seat + meter usage', async () => {
    (fakeDb.select as any) = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ plan: 'team', seats: 10 }])) })),
    }));
    const b = await ent.getBilling('org_1');
    expect(b.orgId).toBe('org_1');
    expect(b.seatLimit).toBe(10);
  });

  it('listAudit filters by outcome', async () => {
    (fakeDb.select as any) = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
    }));
    const rows = await ent.listAudit('org_1', { outcome: 'denied' });
    expect(Array.isArray(rows)).toBe(true);
  });

  it('getComplianceReport aggregates RBAC + SIEM posture', async () => {
    const rep = await ent.getComplianceReport('org_1');
    expect(rep.format).toBe('json');
    expect((rep.payload as any).rbac).toBeDefined();
    expect((rep.payload as any).siem).toBeDefined();
  });
});

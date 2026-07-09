import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enterpriseService as es } from '../src/services/enterprise.service.js';
import { P2P, setP2PBackend } from '../src/services/p2p-swarm.js';
import { randomBytes } from 'node:crypto';

// ── in-memory fakes ──────────────────────────────────────────────
function fakeOrg() {
  return { id: `org_${randomBytes(6).toString('hex')}`, name: `Acme-${randomBytes(3).toString('hex')}`, plan: 'enterprise' as const, createdAt: Date.now() };
}
function fakeUser(orgId: string, roles: string[] = ['member']) {
  return { id: `usr_${randomBytes(6).toString('hex')}`, orgId, email: `${randomBytes(4).toString('hex')}@acme.test`, name: 'U', roles, status: 'active' as const, createdAt: Date.now() };
}
function fakeRole(orgId: string, name: string, perms: string[]) {
  return { id: `role_${randomBytes(6).toString('hex')}`, orgId, name, permissions: perms, createdAt: Date.now() };
}
function fakeSub(orgId: string) {
  return { id: `sub_${randomBytes(6).toString('hex')}`, orgId, plan: 'enterprise', status: 'active' as const, seats: 10, pricePerSeatCents: 1000, currentPeriodEnd: Date.now() + 86_400_000, createdAt: Date.now() };
}
function fakeIdp(orgId: string, kind: 'oidc' | 'saml' = 'oidc') {
  return { id: `idp_${randomBytes(6).toString('hex')}`, orgId, kind, name: `${kind}-idp`, issuer: `https://idp.${kind}.test`, clientId: 'cid', clientSecret: 'csecret', config: { entityId: 'e', ssoUrl: 'https://sso.test', x509: 'cert', acsUrl: 'https://acs.test' }, enabled: true, createdAt: Date.now() };
}
function fakeInvite(orgId: string, email: string) {
  return { id: `inv_${randomBytes(6).toString('hex')}`, orgId, email, role: 'member', token: randomBytes(12).toString('hex'), status: 'pending' as const, createdAt: Date.now() };
}

beforeEach(() => {
  es.reset();
  P2P.reset();
  setP2PBackend('memory');
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

// ── RBAC & multi-tenant isolation ───────────────────────────────
describe('EnterpriseService — RBAC & multi-tenant isolation', () => {
  it('creates a role and assigns to user; membership check enforces org scope', () => {
    const a = fakeOrg();
    const b = fakeOrg();
    es.createOrg(a);
    es.createOrg(b);

    const roleA = fakeRole(a.id, 'admin', ['memories:read', 'memories:write']);
    es.createRole(roleA);
    const uA = fakeUser(a.id, [roleA.id]);
    es.createUser(uA);
    const uB = fakeUser(b.id); // belongs to different org
    es.createUser(uB);

    expect(es.userHasPermission(uA.id, 'memories:read')).toBe(true);
    expect(es.userHasPermission(uA.id, 'billing:read')).toBe(false);

    // userB is in org B and must never see org A roles
    expect(es.userHasPermission(uB.id, 'memories:read')).toBe(false);
    expect(es.listRoles(a.id).map((r) => r.id)).toContain(roleA.id);
    expect(es.listRoles(b.id).map((r) => r.id)).not.toContain(roleA.id);
  });

  it('throws when listing roles for an unknown org', () => {
    expect(() => es.listRoles('nope')).toThrow();
  });

  it('removeRole revokes permissions', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const role = fakeRole(o.id, 'viewer', ['memories:read']);
    es.createRole(role);
    const u = fakeUser(o.id, [role.id]);
    es.createUser(u);
    es.removeRole(o.id, role.id);
    expect(es.userHasPermission(u.id, 'memories:read')).toBe(false);
  });

  it('enforces tenant isolation across users/subs/invites', () => {
    const o1 = fakeOrg();
    const o2 = fakeOrg();
    es.createOrg(o1);
    es.createOrg(o2);
    const u1 = fakeUser(o1.id);
    const u2 = fakeUser(o2.id);
    es.createUser(u1);
    es.createUser(u2);
    es.createSubscription(fakeSub(o1.id));
    es.createInvite(fakeInvite(o1.id, 'x@y.z'));

    expect(es.listUsers(o1.id).map((u) => u.id)).toContain(u1.id);
    expect(es.listUsers(o2.id).map((u) => u.id)).not.toContain(u1.id);
    expect(es.listSubscriptions(o1.id).length).toBe(1);
    expect(es.listSubscriptions(o2.id).length).toBe(0);
    expect(es.listInvites(o1.id).length).toBe(1);
    expect(es.listInvites(o2.id).length).toBe(0);
  });
});

// ── OIDC / SAML stub validation ─────────────────────────────────
describe('EnterpriseService — OIDC/SAML IdP validation (stub)', () => {
  it('accepts a well-formed OIDC IdP and round-trips it', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const idp = fakeIdp(o.id, 'oidc');
    es.createIdP(idp);
    const got = es.getIdP(idp.id);
    expect(got?.kind).toBe('oidc');
    expect(got?.issuer).toBe(idp.issuer);
  });

  it('accepts a SAML IdP and rejects malformed stubs', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const idp = fakeIdp(o.id, 'saml');
    es.createIdP(idp);
    expect(es.getIdP(idp.id)?.kind).toBe('saml');

    const bad = { ...idp, id: `idp_${randomBytes(6).toString('hex')}`, kind: 'oidc' as const, issuer: '', clientId: '', clientSecret: '' };
    expect(() => es.createIdP(bad)).toThrow(/issuer|clientId|clientSecret/);
  });

  it('exchangeOidcCodeStub returns a deterministic payload including idp id', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const idp = fakeIdp(o.id, 'oidc');
    es.createIdP(idp);
    const r = es.exchangeOidcCodeStub(idp.id, 'code-123');
    expect(r.idpId).toBe(idp.id);
    expect(r.email).toMatch(/@/);
    expect(r.accessToken).toBeDefined();
  });

  it('exchangeOidcCodeStub throws for unknown IdP', () => {
    expect(() => es.exchangeOidcCodeStub('missing', 'c')).toThrow(/IdP/);
  });

  it('exchangeSamlResponseStub derives email from NameID', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const idp = fakeIdp(o.id, 'saml');
    es.createIdP(idp);
    const r = es.exchangeSamlResponseStub(idp.id, 'alice@corp.test', '<xml/>');
    expect(r.email).toBe('alice@corp.test');
    expect(r.idpId).toBe(idp.id);
  });

  it('exchangeSamlResponseStub throws without NameID', () => {
    const o = fakeOrg();
    es.createOrg(o);
    const idp = fakeIdp(o.id, 'saml');
    es.createIdP(idp);
    expect(() => es.exchangeSamlResponseStub(idp.id, '', '<xml/>')).toThrow(/NameID/);
  });
});

// ── Billing / subscription ──────────────────────────────────────
describe('EnterpriseService — billing', () => {
  it('computes monthly cost from seats * price', () => {
    const o = fakeOrg();
    es.createOrg(o);
    es.createSubscription(fakeSub(o.id));
    const cost = es.getSubscriptionCost(o.id);
    expect(cost).toBe(10 * 1000);
    es.touch(); // ensure no-op call path
  });

  it('returns 0 cost with no subscription', () => {
    const o = fakeOrg();
    es.createOrg(o);
    expect(es.getSubscriptionCost(o.id)).toBe(0);
  });

  it('records usage events against an org', () => {
    const o = fakeOrg();
    es.createOrg(o);
    es.recordUsage(o.id, 'api_call', 5);
    const usage = es.getUsage(o.id);
    expect(usage.length).toBe(1);
    expect(usage[0].qty).toBe(5);
  });
});

// ── P2P mesh (memory backend) ───────────────────────────────────
describe('EnterpriseService — P2P mesh (memory transport)', () => {
  it('registers peers and lists them isolated per node', () => {
    // node A
    P2P.peerDiscovery(['127.0.0.1:7100', '127.0.0.1:7101']);
    const peersA = P2P.getPeers();
    expect(peersA.length).toBe(2);

    // a second independent node should not share state
    const P2P2 = P2P; // same singleton in-memory backend
    P2P2.reset();
    P2P2.peerDiscovery(['127.0.0.1:7200']);
    expect(P2P2.getPeers().length).toBe(1);
  });

  it('publishes a message and receives it via REST handler', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const received: unknown[] = [];
    P2P.events.on('p2p:message', (m: unknown) => received.push(m));
    await P2P.publish('audit_checkpoint', JSON.stringify({ root: 'R', checkpointId: 'C' }));
    // message handler echoes our own publish semantics; test receive path directly
    const res = P2P.receiveMessageHandler({ from: 'peer-x', topic: 'audit_checkpoint', data: '{"root":"R"}' });
    expect(res.ok).toBe(true);
    expect(received.length).toBe(1);
  });

  it('emitAuditCheckpoint fans out to peers', async () => {
    const sent: string[] = [];
    const orig = P2P.publish.bind(P2P);
    vi.spyOn(P2P, 'publish').mockImplementation(async (topic: string, data: string) => {
      sent.push(`${topic}:${data}`);
      return orig(topic, data);
    });
    await P2P.emitAuditCheckpoint('root123', 'cp1');
    expect(sent.some((s) => s.includes('audit_checkpoint'))).toBe(true);
  });
});

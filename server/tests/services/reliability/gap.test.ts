/**
 * Unit tests for Sentinel's reliability gap/* subfolder modules (batch 2).
 * Pure/in-memory modules; db/audit/siem mocked where imported. No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'x' }])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  },
}));
vi.mock('../../../src/lib/audit.js', () => ({
  appendAudit: vi.fn(() => Promise.resolve()),
  Tx: class {},
}));
vi.mock('../../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('../../../src/lib/env.js', () => ({ env: { VAULT_DIR: '/tmp' } }));

import { SEVERITIES, slaFor, isResponseOverdue } from '../../../src/services/reliability/gap/sev-framework.js';
import { setRotation, currentFor, escalate } from '../../../src/services/reliability/gap/oncall.js';
import { render } from '../../../src/services/reliability/gap/comms-templates.js';
import { activate, isActive, consume, purgeExpired } from '../../../src/services/reliability/gap/break-glass.js';

beforeEach(() => {
  // rotations and break-glass sessions are module-level; tests are order-independent enough
});

describe('sev-framework', () => {
  it('defines an ordered severity set', () => {
    expect(SEVERITIES).toContain('critical');
    expect(SEVERITIES).toContain('low');
  });
  it('maps a severity to an SLA window', () => {
    const sla = slaFor('critical');
    expect(sla).toHaveProperty('responseMins');
    expect(sla).toHaveProperty('resolveMins');
  });
  it('detects an overdue response', () => {
    const sla = slaFor('critical');
    const opened = Date.now() - (sla.responseMins + 10) * 60_000;
    expect(isResponseOverdue({ severity: 'critical', openedAt: opened, firstResponseAt: undefined } as any)).toBe(true);
  });
});

describe('oncall', () => {
  it('sets and reads a rotation', () => {
    setRotation('svc', ['a', 'b'], 'a', 'b');
    expect(currentFor('svc')).toBe('a');
  });
  it('escalates backup to current', () => {
    setRotation('svc2', ['a', 'b', 'c'], 'a', 'b');
    const next = escalate('svc2');
    expect(next).toBe('b');
  });
});

describe('comms-templates', () => {
  it('renders an internal message', () => {
    const m = render('internal', { incidentId: 'INC-1', sev: 'P1', summary: 'down' });
    expect(m).toContain('INC-1');
  });
  it('renders a status page message', () => {
    const m = render('status_page', { incidentId: 'INC-2', sev: 'P2', summary: 'slow' });
    expect(m).toContain('investigating');
  });
  it('renders a customer message', () => {
    const m = render('customer', { incidentId: 'INC-3', sev: 'P3', summary: 'brief' });
    expect(m).toContain('Dear customer');
  });
});

describe('break-glass', () => {
  it('activates with a valid reason', () => {
    const bg = activate('emergency patching', ['admin'], 'op1');
    expect(bg.id).toBeDefined();
    expect(isActive(bg.id)).toBe(true);
  });

  it('rejects an empty reason', () => {
    expect(() => activate('', ['admin'], 'op1')).toThrow();
  });

  it('expires after TTL', () => {
    const bg = activate('need access', ['admin'], 'op1');
    expect(isActive(bg.id, bg.expiresAt + 1)).toBe(false);
  });

  it('consumes an active session', () => {
    const bg = activate('deploy fix', ['deploy'], 'op1');
    const used = consume(bg.id, 'op2');
    expect(used.usedBy).toBe('op2');
  });

  it('purges expired sessions', () => {
    const bg = activate('temp', ['x'], 'op1');
    const n = purgeExpired(bg.expiresAt + 1);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});

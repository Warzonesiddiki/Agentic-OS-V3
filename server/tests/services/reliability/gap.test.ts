/**
 * Sentinel reliability/gap namespace — unit tests.
 * Covers: sev-framework, oncall, comms-templates, break-glass.
 * Pure logic is exercised directly; db/audit/permissions deps are mocked.
 * No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock factories are hoisted above module evaluation: constructing the
// proxy at top level hits TDZ ("Cannot access 'db' before initialization").
// vi.hoisted evaluates before any factory, which is the supported fix.
const { db } = vi.hoisted(() => {
  const makeChain = (): unknown => {
    const fn: any = (..._a: unknown[]) => makeChain();
    return new Proxy(fn, {
      get: (_t, p) => {
        if (p === 'findFirst' || p === 'findMany') return () => Promise.resolve(p === 'findFirst' ? null : []);
        if (p === 'returning') return () => Promise.resolve([]);
        if (p === 'values') return () => makeChain();
        if (p === 'set') return () => makeChain();
        if (p === 'where') return () => Promise.resolve([]);
        if (p === 'from') return () => makeChain();
        return makeChain();
      },
    });
  };
  const dbQuery = new Proxy({}, { get: () => makeChain() });
  const db = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'query') return dbQuery;
      return makeChain();
    },
  });
  return { db };
});

vi.mock('../../../src/db/client.js', () => ({ db }));
vi.mock('../../../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../src/lib/env.js', () => ({
  env: { NODE_ENV: 'test' },
  getEnv: () => ({ NODE_ENV: 'test' }),
}));
vi.mock('../../../src/services/agent-permissions.js', () => ({
  revokeAll: vi.fn(() => Promise.resolve()),
  grant: vi.fn(() => Promise.resolve()),
}));

import { SEVERITIES, slaFor, isResponseOverdue, Severity } from '../../../src/services/reliability/gap/sev-framework.js';
import { setRotation, currentFor, escalate, OnCall } from '../../../src/services/reliability/gap/oncall.js';
import { render, CommsChannel } from '../../../src/services/reliability/gap/comms-templates.js';
import { activate, isActive, consume, purgeExpired, BreakGlass } from '../../../src/services/reliability/gap/break-glass.js';

beforeEach(() => vi.clearAllMocks());

describe('sev-framework', () => {
  it('exposes a severity taxonomy', () => {
    expect(Object.keys(SEVERITIES).length).toBe(4);
    expect(SEVERITIES.sev1.name).toBe('Critical');
  });

  it('returns an SLA for a known severity', () => {
    const sla = slaFor('sev1');
    expect(sla).toHaveProperty('responseMins');
    expect(typeof sla.responseMins).toBe('number');
  });

  it('detects an overdue response', () => {
    const start = Date.now() - (SEVERITIES.sev1.responseMins + 1) * 60 * 1000;
    expect(isResponseOverdue('sev1', start)).toBe(true);
    expect(isResponseOverdue('sev1', Date.now())).toBe(false);
  });
});

describe('oncall', () => {
  it('sets a rotation and resolves the current responder', () => {
    const oc: OnCall = setRotation('payments', ['alice', 'bob'], 'alice', 'bob');
    expect(oc.current).toBe('alice');
    expect(currentFor('payments')).toBe('alice');
  });

  it('escalates to the backup responder', () => {
    setRotation('ledger', ['alice', 'bob'], 'alice', 'bob');
    const next = escalate('ledger');
    expect(next).toBe('bob');
  });
});

describe('comms-templates', () => {
  it('renders a known channel with context', () => {
    const out = render('internal' as CommsChannel, {
      incidentId: 'INC-1',
      sev: 'sev1',
      summary: 'Outage',
      eta: '30m',
    });
    expect(typeof out).toBe('string');
    expect(out).toContain('INC-1');
  });
});

describe('break-glass', () => {
  it('activates, reports active, records the consuming actor, and expires on TTL', () => {
    const bg: BreakGlass = activate('emergency fix', ['agents:write', 'kill-switch:bypass'], 'root');
    expect(bg.id).toBeTruthy();
    expect(isActive(bg.id)).toBe(true);
    const consumed = consume(bg.id, 'root');
    expect(consumed.usedBy).toBe('root');
    // A grant remains active until its TTL elapses; use does not void it.
    expect(isActive(bg.id)).toBe(true);
    expect(isActive(bg.id, Date.now() + 2 * 60 * 60 * 1000)).toBe(false);
  });

  it('purges expired grants', () => {
    const bg = activate('temporary grant', ['x'], 'root');
    // 61 minutes strictly exceeds the 60-minute TTL even when activate and
    // purge land within the same millisecond.
    purgeExpired(Date.now() + 61 * 60 * 1000);
    expect(isActive(bg.id)).toBe(false);
  });

  it('rejects activation without a recorded reason', () => {
    expect(() => activate('x', ['x'], 'root')).toThrow();
  });
});

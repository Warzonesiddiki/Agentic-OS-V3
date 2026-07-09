/**
 * Aegis incident-response — SecC (nonstop perfection).
 *
 * Proves:
 *  - openIncident records an 'open' incident with correct severity + INC- id.
 *  - severityRank ordering is monotonic (sev1 < sev2 < sev3 < sev4).
 *  - autoQuarantine isolates the principal; for sev1 it engages the kill switch.
 *  - resolveIncident transitions to 'resolved'.
 *  - unknown-incident operations throw ApiError (fail closed).
 *
 * No DB — audit/siem/kill-switch are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  let killEngaged = false;
  return {
    reset: () => (killEngaged = false),
    wasKillEngaged: () => killEngaged,
    setKill: (v: boolean) => (killEngaged = v),
  };
});

vi.mock('../src/db/client.js', () => ({
  db: { insert: vi.fn(), select: vi.fn() },
  isSqlite: false,
}));
vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn(async () => ({ sequence: 1, id: 'x', entryHash: 'h' })),
}));
vi.mock('../src/lib/logging.js', () => ({
  log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(async () => undefined),
}));
vi.mock('../src/services/session.service.js', () => ({
  setKillSwitch: vi.fn(async (engaged: boolean) => {
    h.setKill(engaged);
    return { engaged };
  }),
}));

import {
  openIncident,
  getIncident,
  listIncidents,
  autoQuarantine,
  resolveIncident,
  severityRank,
} from '../src/services/incident-response.js';
import { ApiError } from '../src/lib/errors.js';

beforeEach(() => {
  // The module keeps a module-level incident Map keyed by unique random ids,
  // so tests stay isolated without needing to reset it. Reset kill-switch state.
  h.reset();
  vi.clearAllMocks();
});

describe('Aegis: incident-response', () => {
  it('openIncident creates an open incident with an INC- id and correct severity', () => {
    const inc = openIncident('Suspicious agent behavior', 'sev2', 'agent:42');
    expect(inc.id.startsWith('INC-')).toBe(true);
    expect(inc.status).toBe('open');
    expect(inc.severity).toBe('sev2');
    expect(inc.affectedPrincipal).toBe('agent:42');
    expect(getIncident(inc.id)).toBe(inc);
  });

  it('severityRank is monotonic', () => {
    expect(severityRank('sev1')).toBeLessThan(severityRank('sev2'));
    expect(severityRank('sev2')).toBeLessThan(severityRank('sev3'));
    expect(severityRank('sev3')).toBeLessThan(severityRank('sev4'));
  });

  it('listIncidents returns every opened incident', () => {
    const a = openIncident('a', 'sev3');
    const b = openIncident('b', 'sev4');
    const ids = listIncidents().map((i) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('autoQuarantine isolates the principal and records the action', async () => {
    const inc = openIncident('crypto anomaly', 'sev2', 'agent:7');
    const out = await autoQuarantine(inc.id);
    expect(out.status).toBe('quarantined');
    expect(out.actions).toContain('quarantine:agent:7');
    // sev2 must NOT engage the kill switch.
    expect(h.wasKillEngaged()).toBe(false);
  });

  it('autoQuarantine for sev1 engages the kill switch (systemic threat)', async () => {
    const inc = openIncident('lateral movement detected', 'sev1', 'agent:9');
    const out = await autoQuarantine(inc.id);
    expect(out.status).toBe('quarantined');
    expect(out.actions).toContain('kill_switch:engaged');
    expect(h.wasKillEngaged()).toBe(true);
  });

  it('resolveIncident transitions to resolved', () => {
    const inc = openIncident('noise', 'sev4');
    const out = resolveIncident(inc.id, 'false-positive');
    expect(out.status).toBe('resolved');
    expect(out.actions).toContain('resolved:false-positive');
  });

  it('autoQuarantine on unknown incident throws ApiError (fail closed)', async () => {
    await expect(autoQuarantine('INC-doesnotexist')).rejects.toBeInstanceOf(ApiError);
  });

  it('resolveIncident on unknown incident throws ApiError (fail closed)', () => {
    expect(() => resolveIncident('INC-doesnotexist', 'x')).toThrow(ApiError);
  });
});

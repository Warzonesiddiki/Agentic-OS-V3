/**
 * Phase 14/18 seam — guardrails + quarantine request path (unit, no DB).
 * DB/audit side-effects mocked.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({ db: {}, systemMeta: {}, auditLog: {} }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(async () => {}), Tx: class {} }));
vi.mock('../src/siem-forwarder.js', () => ({ forward: vi.fn(async () => {}) }));

import {
  registerGuardrail,
  setGuardrailThreshold,
  assertWithinGuardrail,
  listGuardrails,
  seedDefaults,
} from '../src/services/guardrails.js';
import {
  quarantineAgent,
  releaseQuarantine,
  activeQuarantines,
  purgeExpired,
} from '../src/services/reliability/quarantine.js';
import { setTier } from '../src/services/reliability/degraded-mode.js';

describe('guardrails', () => {
  it('registers, updates thresholds, and blocks over-limit', () => {
    registerGuardrail({ id: 'g1', metric: 'tokens', max: 100, warnAt: 80, enabled: true });
    const updated = setGuardrailThreshold('g1', { max: 50 });
    expect(updated.max).toBe(50);
    expect(assertWithinGuardrail('g1', 60).allowed).toBe(false);
    expect(assertWithinGuardrail('g1', 40).level).toBe('ok');
    expect(assertWithinGuardrail('g1', 45).level).toBe('warn');
  });
  it('rejects inverted ranges', () => {
    registerGuardrail({ id: 'g2', metric: 'cost_usd', max: 10, enabled: true });
    expect(() => setGuardrailThreshold('g2', { min: 20, max: 5 })).toThrow(/INVALID_RANGE/);
  });
  it('seeds defaults', () => {
    seedDefaults();
    expect(listGuardrails().length).toBeGreaterThan(0);
  });
});

describe('quarantine request path (Sentinel owns final say)', () => {
  it('quarantines: records, revokes scopes, drops to safe tier', () => {
    setTier('full', 'reset');
    const decision = quarantineAgent('agentX', 'runaway token usage', 1000, 'pulse');
    expect(decision.request.status).toBe('active');
    expect(decision.tierDroppedTo).toBe('safe');
    expect(activeQuarantines().some((q) => q.id === decision.request.id)).toBe(true);
    const released = releaseQuarantine(decision.request.id);
    expect(released.status).toBe('released');
  });
  it('rejects a malformed request', () => {
    expect(() => quarantineAgent('', 'x', 1000)).toThrow(/BAD_REQUEST/);
    expect(() => quarantineAgent('a', '', 1000)).toThrow(/BAD_REQUEST/);
  });
  it('purges expired quarantines', () => {
    quarantineAgent('agentY', 'reason', -1, 'pulse');
    expect(purgeExpired(Date.now() + 10)).toBeGreaterThanOrEqual(1);
  });
});

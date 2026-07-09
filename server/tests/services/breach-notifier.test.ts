/** breach-notifier.test.ts — breach incident notification (Aegis namespace). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';

vi.mock('../../src/services/siem-forwarder.js', () => ({
  siemConfigured: vi.fn(() => true),
  forward: vi.fn(async () => undefined),
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { declareBreach, notifyStakeholders, isRegulatorDeadlineMissed } from '../../src/services/breach-notifier.js';
import { forward } from '../../src/services/siem-forwarder.js';
const mockedForward = vi.mocked(forward);

describe('declareBreach', () => {
  it('creates a notice, forwards a SIEM event, and starts with empty notified list', () => {
    const n = declareBreach({
      detectedAt: 1_000,
      severity: 'critical',
      affectedRecords: 500,
      dataClasses: ['email', 'ssn'],
      regulatorDeadlineHours: 72,
    });
    expect(n.id).toBeTruthy();
    expect(n.notified).toEqual([]);
    expect(n.dataClasses).toEqual(['email', 'ssn']);
    expect(mockedForward).toHaveBeenCalledOnce();
    const arg = mockedForward.mock.calls[0][0] as { kind: string; severity: string };
    expect(arg.kind).toBe('breach.declared');
    expect(arg.severity).toBe('critical');
  });
});

describe('notifyStakeholders', () => {
  it('appends stakeholders to the notified list', () => {
    const n = declareBreach({ detectedAt: 1, severity: 'high', affectedRecords: 1, dataClasses: [], regulatorDeadlineHours: 72 });
    const updated = notifyStakeholders(n.id, ['dpo@x', 'legal@x']);
    expect(updated.notified).toEqual(['dpo@x', 'legal@x']);
  });

  it('throws BREACH_NOT_FOUND for an unknown id', () => {
    let code = '';
    try {
      notifyStakeholders('missing', ['a']);
    } catch (e) {
      code = (e as ApiError).code;
    }
    expect(code).toBe('BREACH_NOT_FOUND');
  });
});

describe('isRegulatorDeadlineMissed', () => {
  it('is false before the deadline', () => {
    const n = declareBreach({ detectedAt: 1_000_000, severity: 'moderate', affectedRecords: 1, dataClasses: [], regulatorDeadlineHours: 72 });
    expect(isRegulatorDeadlineMissed(n.id, 1_000_001)).toBe(false);
  });

  it('is true after the deadline', () => {
    const n = declareBreach({ detectedAt: 1_000_000, severity: 'moderate', affectedRecords: 1, dataClasses: [], regulatorDeadlineHours: 72 });
    const deadline = 1_000_000 + 72 * 3600_000 + 1;
    expect(isRegulatorDeadlineMissed(n.id, deadline)).toBe(true);
  });

  it('throws BREACH_NOT_FOUND for an unknown id', () => {
    let code = '';
    try {
      isRegulatorDeadlineMissed('missing', 1);
    } catch (e) {
      code = (e as ApiError).code;
    }
    expect(code).toBe('BREACH_NOT_FOUND');
  });
});

/**
 * insider-threat.test.ts — insider-threat scoring & watchlist (Aegis namespace).
 * Holds module-level mutable state, so we reset modules for a clean slate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';

describe('insider-threat (fresh state)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const benign = { principalId: 'a1', offHoursAccess: 0, privilegeEscalations: 0, dataEgressVolume: 500, failedAuth: 0, flaggedActions: 0 };
  const malicious = { principalId: 'a3', offHoursAccess: 5, privilegeEscalations: 30, dataEgressVolume: 10000, failedAuth: 2, flaggedActions: 10 };

  it('riskScore of a benign profile is low', async () => {
    const { riskScore } = await import('../../src/services/insider-threat.js');
    expect(riskScore(benign)).toBe(10); // floor(500/100)*2 = 10
  });

  it('riskScore of a malicious profile is high', async () => {
    const { riskScore } = await import('../../src/services/insider-threat.js');
    // 5 + 90 + 200 + 1 + 40 = 336
    expect(riskScore(malicious)).toBe(336);
  });

  it('recordBehavior persists behavior and riskScore reflects it', async () => {
    const { recordBehavior, riskScore } = await import('../../src/services/insider-threat.js');
    recordBehavior(malicious);
    expect(riskScore(malicious)).toBe(336);
  });

  it('evaluatePrincipal flags a high cumulative risk principal', async () => {
    const { recordBehavior, evaluatePrincipal } = await import('../../src/services/insider-threat.js');
    recordBehavior(malicious);
    const verdict = evaluatePrincipal('a3');
    expect(verdict.risk).toBeGreaterThanOrEqual(20);
    expect(verdict.flagged).toBe(true);
  });

  it('evaluatePrincipal clears a low-risk principal', async () => {
    const { recordBehavior, evaluatePrincipal } = await import('../../src/services/insider-threat.js');
    recordBehavior(benign);
    const verdict = evaluatePrincipal('a1');
    expect(verdict.flagged).toBe(false);
  });

  it('evaluatePrincipal throws INSIDER_NO_DATA when absent', async () => {
    const { evaluatePrincipal } = await import('../../src/services/insider-threat.js');
    let code = '';
    try {
      evaluatePrincipal('ghost');
    } catch (e) {
      code = (e as ApiError).code;
    }
    expect(code).toBe('INSIDER_NO_DATA');
  });
});

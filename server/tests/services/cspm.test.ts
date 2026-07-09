/** cspm.test.ts — Cloud Security Posture Management (Aegis namespace, pure). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';

const getEnvMock = vi.fn(() => ({}) as Record<string, unknown>);
vi.mock('../../src/lib/env.js', () => ({ getEnv: () => getEnvMock() }));

import { evaluate, complianceScore, assertCompliant, DEFAULT_RULES } from '../../src/services/cspm.js';

beforeEach(() => {
  getEnvMock.mockReturnValue({ NODE_ENV: 'development', STORAGE_PUBLIC: 'false', SAFETY_ENABLED: 'true' });
});

describe('evaluate', () => {
  it('evaluates the default rules against an env map', () => {
    const results = evaluate({ STORAGE_PUBLIC: 'false', NODE_ENV: 'development', SAFETY_ENABLED: 'true' });
    expect(results.length).toBe(DEFAULT_RULES.length);
    const byId = Object.fromEntries(results.map((r) => [r.ruleId, r.compliant]));
    expect(byId['no-public-bucket']).toBe(true);
    expect(byId['kill-switch-armed']).toBe(true);
  });

  it('flags a public bucket', () => {
    const results = evaluate({ STORAGE_PUBLIC: 'true' });
    expect(results.find((r) => r.ruleId === 'no-public-bucket')!.compliant).toBe(false);
  });

  it('flags missing TLS in production', () => {
    const results = evaluate({ NODE_ENV: 'production', INSECURE_NO_TLS: 'true' });
    expect(results.find((r) => r.ruleId === 'tls-enforced')!.compliant).toBe(false);
  });

  it('flags disabled safety service', () => {
    const results = evaluate({ SAFETY_ENABLED: 'false' });
    expect(results.find((r) => r.ruleId === 'kill-switch-armed')!.compliant).toBe(false);
  });

  it('flags plain-env secrets', () => {
    const results = evaluate({ PLAIN_ENV_SECRETS: true });
    expect(results.find((r) => r.ruleId === 'secrets-via-hsm')!.compliant).toBe(false);
  });

  it('falls back to getEnv() when no env passed', () => {
    getEnvMock.mockReturnValue({ SAFETY_ENABLED: 'false' });
    const results = evaluate();
    expect(results.find((r) => r.ruleId === 'kill-switch-armed')!.compliant).toBe(false);
  });
});

describe('complianceScore', () => {
  it('returns 100 for an empty result set', () => {
    expect(complianceScore([])).toBe(100);
  });
  it('returns 100 when all compliant', () => {
    const r = evaluate({ STORAGE_PUBLIC: 'false', NODE_ENV: 'dev', SAFETY_ENABLED: 'true' });
    expect(complianceScore(r)).toBe(100);
  });
  it('is proportional to the number of compliant rules', () => {
    // 4 default rules, 1 failing -> 75
    const r = evaluate({ SAFETY_ENABLED: 'false' });
    expect(complianceScore(r)).toBe(75);
  });
});

describe('assertCompliant', () => {
  it('does not throw when posture is compliant', () => {
    getEnvMock.mockReturnValue({ NODE_ENV: 'dev', STORAGE_PUBLIC: 'false', SAFETY_ENABLED: 'true' });
    expect(() => assertCompliant()).not.toThrow();
  });

  it('throws CSPM_VIOLATION when a rule fails', () => {
    getEnvMock.mockReturnValue({ SAFETY_ENABLED: 'false' });
    expect(() => assertCompliant()).toThrow(ApiError);
    try {
      assertCompliant();
    } catch (e) {
      expect((e as ApiError).code).toBe('CSPM_VIOLATION');
    }
  });
});

/** cspm.ts — Cloud Security Posture Management: rule-based config drift detection. */
import { ApiError } from '../lib/errors.js';
import { getEnv } from '../lib/env.js';

export interface CspmRule {
  id: string;
  description: string;
  check: (env: Record<string, unknown>) => boolean; // true = compliant
}

export const DEFAULT_RULES: CspmRule[] = [
  {
    id: 'no-public-bucket',
    description: 'Object storage must not be public',
    check: (e) => e.STORAGE_PUBLIC !== 'true',
  },
  {
    id: 'tls-enforced',
    description: 'TLS must be enforced in production',
    check: (e) => e.NODE_ENV !== 'production' || e.INSECURE_NO_TLS !== 'true',
  },
  {
    id: 'kill-switch-armed',
    description: 'Kill switch must be reachable (safety service live)',
    check: (e) => e.SAFETY_ENABLED !== 'false',
  },
  {
    id: 'secrets-via-hsm',
    description: 'Secrets must be sourced from HSM/KMS, not plain env',
    check: (e) => !e.PLAIN_ENV_SECRETS,
  },
];

export interface CspmResult {
  ruleId: string;
  compliant: boolean;
  description: string;
}

export function evaluate(
  env: Record<string, unknown> = getEnv() as unknown as Record<string, unknown>
): CspmResult[] {
  return DEFAULT_RULES.map((r) => ({
    ruleId: r.id,
    compliant: r.check(env),
    description: r.description,
  }));
}

export function complianceScore(results: CspmResult[]): number {
  if (!results.length) return 100;
  const ok = results.filter((r) => r.compliant).length;
  return Math.round((ok / results.length) * 100);
}

export function assertCompliant(): void {
  const results = evaluate();
  const failing = results.filter((r) => !r.compliant);
  if (failing.length)
    throw new ApiError(
      'CSPM_VIOLATION',
      'Posture violation: ' + failing.map((f) => f.ruleId).join(', ')
    );
}

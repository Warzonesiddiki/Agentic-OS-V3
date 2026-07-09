/**
 * self-healing.ts — self-healing orchestrator.
 *
 * Detects unhealthy dependencies / degraded tiers and runs remediation playbooks:
 * restart agent, switch tier, reset circuit breaker, re-run failover. Coordinates
 * with Pulse's runtime loop (interface: `heal()` returns applied actions).
 */
import { ApiError } from '../../lib/errors.js';
import { unhealthy } from './dependency-health.js';
import { getTier, setTier } from './degraded-mode.js';
import { registerBreaker, recordSuccess } from './circuit-breaker-registry.js';
import { forward } from '../siem-forwarder.js';

export type HealAction =
  'reset_breaker' | 'raise_tier' | 'lower_tier' | 'quarantine_agent' | 'noop';

export interface HealResult {
  actions: HealAction[];
  healed: boolean;
}

export function heal(breakerName?: string): HealResult {
  const actions: HealAction[] = [];
  const bad = unhealthy();
  if (bad.length > 0) {
    // Dependency unhealthy -> drop a tier to protect the core.
    if (getTier() === 'full') {
      setTier('reduced', 'self-heal:dependency-unhealthy');
      actions.push('lower_tier');
    }
  } else if (getTier() !== 'full') {
    setTier('full', 'self-heal:dependencies-recovered');
    actions.push('raise_tier');
  }
  if (breakerName) {
    try {
      recordSuccess(breakerName); // optimistic reset; breaker reopens if still failing
      actions.push('reset_breaker');
    } catch {
      // breaker not registered; ensure it exists
      registerBreaker(breakerName, { failureThreshold: 5, resetMs: 30_000, halfOpenMax: 2 });
      recordSuccess(breakerName);
      actions.push('reset_breaker');
    }
  }
  if (actions.length) {
    void forward({
      ts: Date.now(),
      kind: 'self_heal.applied',
      severity: 'info',
      attrs: { actions },
    });
  }
  return { actions, healed: actions.length > 0 };
}

export function assertHealable(): void {
  // Placeholder guard for environments where self-heal is disabled.
  if (process.env.DISABLE_SELF_HEAL === 'true')
    throw new ApiError('SELF_HEAL_DISABLED', 'Self-healing is disabled in this environment.');
}

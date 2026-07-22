/**
 * Sentinel reliability namespace — degraded-mode + circuit-breaker-registry unit tests.
 * Pure logic; no FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  getTier,
  setTier,
  registerCapability,
  isAvailable,
  assertAvailable,
  degradedEvents,
} from '../../../src/services/reliability/degraded-mode.js';
import {
  registerBreaker,
  recordFailure,
  allowCall,
  stateOf,
  snapshot,
} from '../../../src/services/reliability/circuit-breaker-registry.js';

beforeEach(() => {
  setTier('full');
  vi.clearAllMocks();
});

describe('degraded-mode tiers', () => {
  it('starts at full tier and updates on setTier', () => {
    expect(getTier()).toBe('full');
    const t = setTier('minimal', 'maintenance');
    expect(t).toBe('minimal');
    expect(getTier()).toBe('minimal');
    setTier('full');
  });

  it('emits a tier-changed event with from/to/reason', () => {
    const seen: Array<unknown> = [];
    const handler = (e: { from: string; to: string; reason?: string }) => seen.push(e);
    degradedEvents.on('tier-changed', handler);
    setTier('reduced', 'test-reason');
    expect(seen.length).toBe(1);
    expect((seen[0] as { from: string; to: string }).from).toBe('full');
    expect((seen[0] as { to: string }).to).toBe('reduced');
    degradedEvents.off('tier-changed', handler);
    setTier('full');
  });
});

describe('degraded-mode capabilities', () => {
  it('registers a capability gated by tier and reports availability', () => {
    registerCapability({ name: 'metrics', minTier: 'reduced' });
    setTier('full');
    expect(isAvailable('metrics')).toBe(true);
    setTier('safe'); // below minTier 'reduced'
    expect(isAvailable('metrics')).toBe(false);
    setTier('full');
  });

  it('throws via assertAvailable when gated off', () => {
    registerCapability({ name: 'admin-panel', minTier: 'full' });
    setTier('full');
    expect(() => assertAvailable('admin-panel')).not.toThrow();
    setTier('minimal');
    expect(() => assertAvailable('admin-panel')).toThrow();
    setTier('full');
  });
});

describe('circuit-breaker-registry', () => {
  it('transitions closed -> open across failures', () => {
    registerBreaker('breaker-x', { failureThreshold: 2, resetMs: 1000, halfOpenMax: 1 });
    expect(stateOf('breaker-x')).toBe('closed');
    recordFailure('breaker-x');
    expect(stateOf('breaker-x')).toBe('closed');
    recordFailure('breaker-x'); // breach threshold
    expect(stateOf('breaker-x')).toBe('open');
    expect(allowCall('breaker-x')).toBe(false);
  });

  it('exposes a snapshot of all breakers', () => {
    registerBreaker('breaker-y', { failureThreshold: 5, resetMs: 1000, halfOpenMax: 1 });
    const snap = snapshot();
    // Production contract: snapshot() returns an array keyed by `name`.
    const breaker = snap.find((entry) => entry.name === 'breaker-y');
    expect(breaker).toBeDefined();
    expect(breaker?.state).toBe('closed');
  });
});

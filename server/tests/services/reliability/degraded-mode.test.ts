/**
 * Dedicated unit tests for Sentinel's reliability namespace — degraded-mode + circuit-breaker-registry.
 * Pure/in-memory modules; no FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));

import {
  degradedEvents,
  registerCapability,
  setTier,
  getTier,
  isAvailable,
  availableCapabilities,
  assertAvailable,
  type Tier,
  type Capability,
} from '../../../src/services/reliability/degraded-mode.js';

import {
  BreakerState,
  registerBreaker,
  recordSuccess,
  recordFailure,
  allowCall,
  stateOf,
  snapshot,
} from '../../../src/services/reliability/circuit-breaker-registry.js';

beforeEach(() => {
  setTier('full', 'test-reset');
});

describe('degraded-mode: tiers', () => {
  it('defaults to full tier', () => {
    expect(getTier()).toBe('full');
  });

  it('setTier updates and returns the new tier', () => {
    expect(setTier('minimal', 'cpu-pressure')).toBe('minimal');
    expect(getTier()).toBe('minimal');
  });

  it('emits a tier-changed event on change', () => {
    const events: { from: Tier; to: Tier }[] = [];
    const handler = (p: { from: Tier; to: Tier }) => events.push(p);
    degradedEvents.on('tier-changed', handler);
    setTier('reduced', 'load');
    degradedEvents.off('tier-changed', handler);
    expect(events.some((e) => e.to === 'reduced')).toBe(true);
  });
});

describe('degraded-mode: capabilities', () => {
  it('reports an unknown capability as available', () => {
    expect(isAvailable('not-registered')).toBe(true);
  });

  it('registers and reports a full-tier capability available at full', () => {
    registerCapability({ name: 'search', minTier: 'full' });
    setTier('full', 'reset');
    expect(isAvailable('search')).toBe(true);
    expect(availableCapabilities()).toContain('search');
  });

  it('disables a full-tier capability when dropped below full', () => {
    registerCapability({ name: 'export', minTier: 'full' });
    setTier('reduced', 'pressure');
    expect(isAvailable('export')).toBe(false);
  });

  it('keeps a minimal-tier capability available at minimal tier', () => {
    registerCapability({ name: 'ingest', minTier: 'minimal' });
    setTier('minimal', 'pressure');
    expect(isAvailable('ingest')).toBe(true);
  });

  it('disables a minimal-tier capability at safe tier', () => {
    registerCapability({ name: 'ingest2', minTier: 'minimal' });
    setTier('safe', 'panic');
    expect(isAvailable('ingest2')).toBe(false);
  });

  it('assertAvailable throws ApiError when not available', () => {
    registerCapability({ name: 'blocked', minTier: 'full' });
    setTier('safe', 'panic');
    expect(() => assertAvailable('blocked')).toThrow();
  });

  it('assertAvailable passes when available', () => {
    registerCapability({ name: 'ok', minTier: 'safe' });
    setTier('safe', 'panic');
    expect(() => assertAvailable('ok')).not.toThrow();
  });
});

describe('circuit-breaker-registry', () => {
  it('registers a breaker in closed state', () => {
    registerBreaker('svc-a', { failureThreshold: 3, resetMs: 1000, halfOpenMax: 1 });
    expect(stateOf('svc-a')).toBe<BreakerState>('closed');
  });

  it('opens after threshold failures', () => {
    registerBreaker('svc-b', { failureThreshold: 2, resetMs: 1000, halfOpenMax: 1 });
    recordFailure('svc-b');
    expect(stateOf('svc-b')).toBe('closed');
    recordFailure('svc-b');
    expect(stateOf('svc-b')).toBe('open');
  });

  it('allowCall returns false when open', () => {
    registerBreaker('svc-c', { failureThreshold: 1, resetMs: 10000, halfOpenMax: 1 });
    recordFailure('svc-c');
    expect(allowCall('svc-c')).toBe(false);
  });

  it('transitions open -> half-open after cooldown', () => {
    const start = 1_000_000;
    registerBreaker('svc-d', { failureThreshold: 1, resetMs: 500, halfOpenMax: 1 });
    recordFailure('svc-d', start);
    expect(allowCall('svc-d', start + 100)).toBe(false); // still cooling
    expect(allowCall('svc-d', start + 600)).toBe(true); // half-open
    expect(stateOf('svc-d')).toBe('half-open');
  });

  it('closes again after success in half-open', () => {
    const start = 2_000_000;
    registerBreaker('svc-e', { failureThreshold: 1, resetMs: 500, halfOpenMax: 2 });
    recordFailure('svc-e', start);
    allowCall('svc-e', start + 600); // half-open
    recordSuccess('svc-e');
    expect(stateOf('svc-e')).toBe('closed');
  });

  it('snapshot lists registered breakers with state', () => {
    registerBreaker('svc-f', { failureThreshold: 5, resetMs: 1000, halfOpenMax: 1 });
    const snap = snapshot();
    expect(snap.find((s) => s.name === 'svc-f')?.state).toBe('closed');
  });
});

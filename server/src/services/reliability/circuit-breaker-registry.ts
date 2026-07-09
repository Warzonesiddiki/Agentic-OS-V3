/** circuit-breaker-registry.ts — central registry of circuit breakers. */
import { ApiError } from '../../lib/errors.js';

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerConfig {
  failureThreshold: number;
  resetMs: number;
  halfOpenMax: number;
}

interface Breaker extends BreakerConfig {
  name: string;
  failures: number;
  lastFailure: number;
  state: BreakerState;
  halfOpenCalls: number;
}

const breakers = new Map<string, Breaker>();

export function registerBreaker(name: string, cfg: BreakerConfig): void {
  breakers.set(name, {
    name,
    ...cfg,
    failures: 0,
    lastFailure: 0,
    state: 'closed',
    halfOpenCalls: 0,
  });
}

export function recordSuccess(name: string): void {
  const b = breakers.get(name);
  if (!b) return;
  b.failures = 0;
  b.state = 'closed';
  b.halfOpenCalls = 0;
}

export function recordFailure(name: string, now: number = Date.now()): void {
  const b = breakers.get(name);
  if (!b) throw new ApiError('BREAKER_NOT_FOUND', `No breaker ${name}`);
  b.failures++;
  b.lastFailure = now;
  if (b.failures >= b.failureThreshold) b.state = 'open';
}

export function allowCall(name: string, now: number = Date.now()): boolean {
  const b = breakers.get(name);
  if (!b) throw new ApiError('BREAKER_NOT_FOUND', `No breaker ${name}`);
  if (b.state === 'open') {
    if (now - b.lastFailure >= b.resetMs) {
      b.state = 'half-open';
      b.halfOpenCalls = 0;
    } else return false;
  }
  if (b.state === 'half-open') {
    if (b.halfOpenCalls >= b.halfOpenMax) return false;
    b.halfOpenCalls++;
  }
  return true;
}

export function stateOf(name: string): BreakerState {
  const b = breakers.get(name);
  if (!b) throw new ApiError('BREAKER_NOT_FOUND', `No breaker ${name}`);
  return b.state;
}

export function snapshot(): { name: string; state: BreakerState }[] {
  return [...breakers.entries()].map(([name, b]) => ({ name, state: b.state }));
}

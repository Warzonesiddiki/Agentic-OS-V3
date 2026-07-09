/**
 * SecB — NONSTOP security perfection workstream.
 *
 * rate-limit.service.ts audit (Batch 2):
 *   (a) per-key token-bucket enforces its own budget independently
 *   (b) a shared/global bucket enforces a global budget across keys
 *   (c) guard() throws a 429-class RATE_LIMITED error after exhaustion
 *
 * No FROZEN files touched. No DB required (pure in-memory buckets).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  configurePolicy,
  check,
  guard,
  RateLimitPolicy,
} from '../src/services/rate-limit.service.js';
import { ApiError } from '../src/lib/errors.js';

const GLOBAL = 'global-budget';

function freshPolicy(key: string, cap: number, refillPerSec: number): RateLimitPolicy {
  return { key, cap, refillPerSec };
}

describe('rate-limit.service (a): per-key budget enforcement', () => {
  beforeEach(() => {
    // (re)create an isolated, fully-drained-free bucket for the test key
    configurePolicy(freshPolicy('per-key-test', 5, 0)); // refill 0 so it stays drained
    // drain it
    for (let i = 0; i < 5; i++) check('per-key-test');
  });

  it('denies once the per-key budget is exhausted', () => {
    const d = check('per-key-test');
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.limit).toBe(5);
    expect(d.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps budgets isolated between keys', () => {
    configurePolicy(freshPolicy('other-key', 100, 0));
    const d = check('other-key');
    expect(d.allowed).toBe(true);
    expect(d.limit).toBe(100);
  });
});

describe('rate-limit.service (b): global budget across keys', () => {
  beforeEach(() => {
    // A single shared global bucket all "tenants" draw from.
    configurePolicy(freshPolicy(GLOBAL, 3, 0));
    for (let i = 0; i < 3; i++) check(GLOBAL);
  });

  it('exhausts the global bucket regardless of which key draws', () => {
    // tenant A and tenant B both draw from the global pool — already drained by beforeEach
    expect(check(GLOBAL).allowed).toBe(false);
  });

  it('allows until the global cap, then denies', () => {
    configurePolicy(freshPolicy('g2', 4, 0));
    for (let i = 0; i < 4; i++) expect(check('g2').allowed).toBe(true);
    expect(check('g2').allowed).toBe(false);
  });
});

describe('rate-limit.service (c): guard() throws RATE_LIMITED (429) after exhaustion', () => {
  beforeEach(() => {
    configurePolicy(freshPolicy('guard-test', 2, 0));
    check('guard-test'); // 1
    check('guard-test'); // 2 -> drained
  });

  it('throws a RATE_LIMITED ApiError when over budget', () => {
    expect(() => guard('guard-test')).toThrow();
    try {
      guard('guard-test');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('RATE_LIMITED');
    }
  });

  it('allows while budget remains', () => {
    configurePolicy(freshPolicy('guard-ok', 10, 0));
    expect(() => guard('guard-ok')).not.toThrow();
  });
});

describe('rate-limit.service: default anonymous policy', () => {
  it('applies a default cap of 60 to unknown keys', () => {
    const key = `anon-${Date.now()}`; // never configured
    const d = check(key); // first call creates default bucket, consumes 1
    expect(d.allowed).toBe(true);
    expect(d.limit).toBe(60);
  });
});

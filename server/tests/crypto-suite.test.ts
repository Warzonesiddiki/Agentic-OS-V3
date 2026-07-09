/**
 * SecB — NONSTOP security perfection workstream.
 *
 * crypto-suite.ts unit audit (Batch 2):
 *   (a) key primitives round-trip / determinism
 *   (b) constant-time comparison resists timing (statistical)
 *   (c) key derivation is deterministic + salt/info-bound
 *
 * No FROZEN files touched.
 */
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  genKey,
  sha256,
  hmac,
  safeEqual,
  constantTimeEqual,
  deriveKey,
  KEY_LEN,
} from '../src/services/crypto-suite.js';

describe('crypto-suite (a): primitive round-trip & determinism', () => {
  it('genKey returns a stable-length buffer and never collides', () => {
    expect(genKey().length).toBe(KEY_LEN);
    const a = genKey();
    const b = genKey();
    expect(a.equals(b)).toBe(false);
  });

  it('sha256 is deterministic and length-stable', () => {
    const h1 = sha256('hello');
    const h2 = sha256('hello');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('world')).not.toBe(h1);
  });

  it('hmac is deterministic and key-dependent', () => {
    const k = genKey();
    const m = 'message';
    expect(hmac(m, k)).toBe(hmac(m, k));
    expect(hmac(m, k)).not.toBe(hmac(m, 'other-key'));
  });
});

describe('crypto-suite (c): key derivation is deterministic + bound to salt/info', () => {
  it('deriveKey is deterministic for identical inputs', () => {
    const a = deriveKey('secret', 'salt', 'info');
    const b = deriveKey('secret', 'salt', 'info');
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it('deriveKey differs when salt changes', () => {
    const a = deriveKey('secret', 'salt-a', 'info');
    const b = deriveKey('secret', 'salt-b', 'info');
    expect(a.equals(b)).toBe(false);
  });

  it('deriveKey differs when info changes', () => {
    const a = deriveKey('secret', 'salt', 'info-a');
    const b = deriveKey('secret', 'salt', 'info-b');
    expect(a.equals(b)).toBe(false);
  });
});

describe('crypto-suite (b): constant-time compare resists timing', () => {
  it('safeEqual returns true for equal strings and false for unequal', () => {
    expect(safeEqual('identical', 'identical')).toBe(true);
    expect(safeEqual('identical', 'different')).toBe(false);
    expect(safeEqual('ab', 'abc')).toBe(false);
  });

  it('constantTimeEqual returns true for equal strings and false for unequal', () => {
    expect(constantTimeEqual('token-xyz', 'token-xyz')).toBe(true);
    expect(constantTimeEqual('token-xyz', 'token-abc')).toBe(false);
  });

  it('safeEqual does not short-circuit on first differing byte (statistical)', () => {
    // Equal-length 256-byte strings; the only difference is at byte 0 vs byte 255.
    // Under constant-time comparison BOTH must scan the full buffer, so their
    // timings must be statistically indistinguishable. A naive early-exit `!==`
    // would make the first-byte mismatch dramatically faster.
    const base = 'x'.repeat(256);
    const differFirst = 'y' + 'x'.repeat(255); // differ at position 0
    const differLast = 'x'.repeat(255) + 'y'; // differ at position 255

    const ITER = 5000;
    const timeFor = (fn: () => void) => {
      const start = performance.now();
      for (let i = 0; i < ITER; i++) fn();
      return performance.now() - start;
    };

    const tFirst = timeFor(() => safeEqual(base, differFirst));
    const tLast = timeFor(() => safeEqual(base, differLast));

    // The decisive constant-time property: first-byte mismatch must not be
    // meaningfully faster than last-byte mismatch. Bound generously for JIT noise.
    const ratio = tFirst / tLast;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  });

  it('constantTimeEqual timing is position-independent (statistical)', () => {
    const base = 'x'.repeat(256);
    const differFirst = 'y' + 'x'.repeat(255);
    const differLast = 'x'.repeat(255) + 'y';

    const ITER = 5000;
    const timeFor = (fn: () => void) => {
      const start = performance.now();
      for (let i = 0; i < ITER; i++) fn();
      return performance.now() - start;
    };

    const tFirst = timeFor(() => constantTimeEqual(base, differFirst));
    const tLast = timeFor(() => constantTimeEqual(base, differLast));

    const ratio = tFirst / tLast;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  });
});

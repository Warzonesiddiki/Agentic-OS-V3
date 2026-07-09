/** lib/audit.test.ts — pure audit-chain helpers (Aegis namespace). */
import { describe, it, expect } from 'vitest';
import { stableStringify, computeEntryHash, GENESIS_HASH } from '../../src/lib/audit.js';

describe('GENESIS_HASH', () => {
  it('is a 64-char zero hex string', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
  });
});

describe('stableStringify', () => {
  it('sorts object keys deterministically', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('serializes primitives as JSON', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('x')).toBe('"x"');
    expect(stableStringify(null)).toBe('null');
  });

  it('handles nested objects with sorted keys', () => {
    const s = stableStringify({ z: { y: 1, x: 2 }, a: 3 });
    expect(s).toBe('{"a":3,"z":{"x":2,"y":1}}');
  });

  it('handles arrays (preserving order)', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('computeEntryHash', () => {
  it('produces a 64-char hex digest', () => {
    const h = computeEntryHash({ seq: 1, action: 'a', actor: 'u', ts: 1, payload: {} });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const e = { seq: 5, action: 'write', actor: 'agent', ts: 123, payload: { k: 'v' } };
    expect(computeEntryHash(e)).toBe(computeEntryHash(e));
  });

  it('differs when action changes', () => {
    const base = { seq: 1, action: 'a', actor: 'u', ts: 1, payload: {} };
    expect(computeEntryHash(base)).not.toBe(computeEntryHash({ ...base, action: 'b' }));
  });
});

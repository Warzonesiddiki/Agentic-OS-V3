/** lib/audit.test.ts — pure audit-chain helpers (Aegis namespace). */
import { describe, it, expect, vi } from 'vitest';

// lib/audit imports the DB client for its async helpers; mock it to keep this
// test free of the native better-sqlite3 binding (we only exercise pure fns).
vi.mock('../../src/db/client.js', () => ({ db: {}, auditLog: {}, systemMeta: {} }));

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
  const call = (over: Partial<{ prevHash: string; sequence: number; action: string; actor: string; createdAtMs: number; payload: unknown }> = {}) =>
    computeEntryHash(
      over.prevHash ?? 'prev',
      over.sequence ?? 1,
      over.action ?? 'a',
      over.actor ?? 'u',
      over.createdAtMs ?? 1,
      over.payload ?? {}
    );

  it('produces a 64-char hex digest', () => {
    expect(call()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(call({ payload: { k: 'v' } })).toBe(call({ payload: { k: 'v' } }));
  });

  it('differs when payload changes', () => {
    expect(call({ payload: { x: 1 } })).not.toBe(call({ payload: { x: 2 } }));
  });

  it('differs when action changes', () => {
    expect(call({ action: 'read' })).not.toBe(call({ action: 'write' }));
  });

  it('differs when actor changes', () => {
    expect(call({ actor: 'a1' })).not.toBe(call({ actor: 'a2' }));
  });
});

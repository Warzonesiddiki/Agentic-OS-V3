/**
 * audit-worker.test.ts — unit tests for the async hash-chain worker thread
 * (Aegis namespace). Verifies the synchronous fallback and that async results
 * match the canonical synchronous computation. `computeHashAsync` lazily spawns
 * a real Worker thread (and transparently falls back to sync if unavailable),
 * so these tests are robust either way.
 */
import { describe, it, expect } from 'vitest';
import {
  computeHashSync,
  computeHashAsync,
  terminateAuditWorker,
} from '../../src/services/audit-worker.js';
import { createHash } from 'node:crypto';

// Stable stringify mirroring the worker's canonical format.
function canonical(prev: string, seq: number, action: string, actor: string, ts: number, payload: unknown): string {
  const stable = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + (v as unknown[]).map(stable).join(',') + ']';
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  };
  return [prev, seq, action, actor, ts, stable(payload)].join('|');
}

const cases: Array<[string, number, string, string, number, unknown]> = [
  ['0'.repeat(64), 1, 'a', 'actor', 1000, { x: 1 }],
  ['abc', 42, 'kill_switch.engaged', 'system', 1_700_000_000_123, { ring: 0, reason: 'manual' }],
  ['', 0, '', '', 0, null],
  ['deadbeef', 999, 'memory.write', 'agent-7', 123456, [1, 2, 3]],
];

describe('computeHashSync', () => {
  it('matches a hand-rolled canonical sha256 (sorted-key stringify)', () => {
    const c = canonical('prev', 7, 'act', 'who', 123, { a: 2, z: 1 });
    const expected = createHash('sha256').update(c, 'utf8').digest('hex');
    expect(computeHashSync('prev', 7, 'act', 'who', 123, { a: 2, z: 1 })).toBe(expected);
  });

  it('is deterministic', () => {
    const h1 = computeHashSync('p', 1, 'x', 'y', 5, { k: 'v' });
    const h2 = computeHashSync('p', 1, 'x', 'y', 5, { k: 'v' });
    expect(h1).toBe(h2);
  });

  it('produces a 64-char hex digest', () => {
    expect(computeHashSync('p', 1, 'x', 'y', 5, {})).toHaveLength(64);
  });

  it('agrees with async for every sampled case', async () => {
    for (const [prev, seq, action, actor, ts, payload] of cases) {
      const sync = computeHashSync(prev, seq, action, actor, ts, payload);
      const async = await computeHashAsync(prev, seq, action, actor, ts, payload);
      expect(async).toBe(sync);
    }
  });
});

describe('computeHashAsync', () => {
  it('returns a valid 64-char hex digest', async () => {
    const h = await computeHashAsync('g', 3, 'ping', 'svc', 999, { ok: true });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when the action changes', async () => {
    const a = await computeHashAsync('g', 3, 'ping', 'svc', 999, {});
    const b = await computeHashAsync('g', 3, 'PONG', 'svc', 999, {});
    expect(a).not.toBe(b);
  });

  it('terminate does not throw', async () => {
    await expect(terminateAuditWorker()).resolves.toBeUndefined();
  });
});

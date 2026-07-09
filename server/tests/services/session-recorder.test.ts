/**
 * Artisan — Phase 16/19 namespace.
 * Unit tests for session-recorder (tamper-evident append-only hash chain).
 *
 * `vitest run` cannot execute in the agent shell (better-sqlite3 ABI); this file
 * is type-checked by tsc and executed by Quill's merge gate (`pnpm run validate`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the audit sink so the in-memory chain can run without a DB connection.
vi.mock('../lib/audit.js', () => ({
  appendAudit: vi.fn(async () => undefined),
}));

import * as recorder from '../services/session-recorder.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('session-recorder — tamper-evident chain', () => {
  it('record() appends with GENESIS prevHash on first entry', () => {
    const rec = recorder.record('s1', 'agent:alpha', 'tool.call', { tool: 'ls' });
    expect(rec.seq).toBe(1);
    expect(rec.prevHash).toBe('GENESIS');
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('each subsequent record chains on the previous hash', () => {
    recorder.record('s2', 'agent:beta', 'a');
    const r2 = recorder.record('s2', 'agent:beta', 'b');
    const r3 = recorder.record('s2', 'agent:beta', 'c');
    expect(r2.seq).toBe(2);
    expect(r2.prevHash).toBe(recorder.replay('s2')[0]!.hash);
    expect(r3.seq).toBe(3);
    expect(r3.prevHash).toBe(r2.hash);
  });

  it('verifyChain() returns true for an unmodified chain', () => {
    recorder.record('s3', 'u', 'x');
    recorder.record('s3', 'u', 'y');
    expect(recorder.verifyChain('s3')).toBe(true);
  });

  it('verifyChain() detects tampering of a payload', () => {
    recorder.record('s4', 'u', 'x', { v: 1 });
    const chain = recorder.replay('s4');
    // Mutate a payload post-hoc (simulating tamper) — verifyChain recomputes hashes.
    chain[0]!.payload.v = 999;
    expect(recorder.verifyChain('s4')).toBe(false);
  });

  it('verifyChain() detects prevHash linkage break', () => {
    recorder.record('s5', 'u', 'x');
    recorder.record('s5', 'u', 'y');
    const chain = recorder.replay('s5');
    // Break the chain by editing a middle record's prevHash.
    chain[1]!.prevHash = 'tampered';
    expect(recorder.verifyChain('s5')).toBe(false);
  });

  it('replay() throws for unknown session', () => {
    expect(() => recorder.replay('does-not-exist')).toThrow();
  });

  it('record() writes an audit event', async () => {
    const { appendAudit } = await import('../lib/audit.js');
    recorder.record('s6', 'actor1', 'did.thing');
    expect(appendAudit).toHaveBeenCalled();
  });
});

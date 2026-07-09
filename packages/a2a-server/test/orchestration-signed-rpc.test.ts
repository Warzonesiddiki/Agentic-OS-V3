/**
 * Signed-RPC + replay-protection tests for A2AEnvelopeExt (Phase 13 A2A++, gap 13.33).
 *
 * These exercise the detached-HMAC signing path and the verify gate without any
 * DB/network deps. Key table is an in-memory map keyed by keyId.
 */
import { describe, it, expect } from 'vitest';
import {
  signA2AEnvelope,
  verifyA2AEnvelope,
  randomNonce,
  DEFAULT_ENVELOPE_TTL_MS,
  type A2AEnvelopeExt,
} from '../src/orchestration-a2a.js';

const KEY_TABLE: Record<string, string> = {
  k1: 'shared-secret-agent-a',
  k2: 'shared-secret-agent-b',
};

const resolve = (keyId: string) => KEY_TABLE[keyId];

function baseEnvelope(sender = 'agent-a'): A2AEnvelopeExt {
  return {
    taskId: 'task-1',
    traceId: 'trace-xyz',
    blackboardRefs: [],
    channel: { role: 'agent' },
    sender,
    timestamp: new Date().toISOString(),
    payload: { cmd: 'do-something' },
  };
}

describe('signA2AEnvelope', () => {
  it('attaches signature, keyId, nonce, and expiresAt', () => {
    const signed = signA2AEnvelope(baseEnvelope(), KEY_TABLE.k1, 'k1');
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.keyId).toBe('k1');
    expect(signed.nonce).toBeDefined();
    expect(signed.expiresAt).toBeDefined();
    // TTL bound honoured
    const delta = new Date(signed.expiresAt!).getTime() - new Date(signed.timestamp).getTime();
    expect(delta).toBeGreaterThanOrEqual(DEFAULT_ENVELOPE_TTL_MS - 5);
  });

  it('produces a deterministic signature for identical inputs', () => {
    const e1 = baseEnvelope();
    const e2 = { ...baseEnvelope() };
    const s1 = signA2AEnvelope(e1, KEY_TABLE.k1, 'k1', {
      nonce: 'same-nonce',
      now: new Date(1_000),
    });
    const s2 = signA2AEnvelope(e2, KEY_TABLE.k1, 'k1', {
      nonce: 'same-nonce',
      now: new Date(1_000),
    });
    expect(s1.signature).toBe(s2.signature);
  });
});

describe('verifyA2AEnvelope', () => {
  it('accepts a well-formed signed envelope exactly once (no replay)', () => {
    const signed = signA2AEnvelope(baseEnvelope('agent-a'), KEY_TABLE.k1, 'k1');
    const first = verifyA2AEnvelope(signed, resolve);
    expect(first.ok).toBe(true);
    expect(first.sender).toBe('agent-a');
    // replay of same nonce -> rejected
    const second = verifyA2AEnvelope(signed, resolve);
    expect(second.ok).toBe(false);
    expect(second.reject).toBe('replay');
  });

  it('rejects an envelope whose signature was tampered', () => {
    const signed = signA2AEnvelope(baseEnvelope(), KEY_TABLE.k1, 'k1');
    const tampered: A2AEnvelopeExt = {
      ...signed,
      payload: { cmd: 'evil-override' },
    };
    const r = verifyA2AEnvelope(tampered, resolve);
    expect(r.ok).toBe(false);
    expect(r.reject).toBe('bad_signature');
  });

  it('rejects when the key is unknown', () => {
    const signed = signA2AEnvelope(baseEnvelope(), 'wrong-secret', 'k-unknown');
    const r = verifyA2AEnvelope(signed, resolve);
    expect(r.ok).toBe(false);
    expect(r.reject).toBe('unknown_key');
  });

  it('rejects an expired envelope', () => {
    const now = new Date();
    // TTL in the past -> already expired
    const signed = signA2AEnvelope(baseEnvelope(), KEY_TABLE.k1, 'k1', {
      now: new Date(now.getTime() - (DEFAULT_ENVELOPE_TTL_MS + 10_000)),
    });
    const r = verifyA2AEnvelope(signed, resolve, { now });
    expect(r.ok).toBe(false);
    expect(r.reject).toBe('expired');
  });

  it('rejects a missing signature / keyId / nonce / expiresAt', () => {
    const partial = baseEnvelope();
    expect(verifyA2AEnvelope(partial, resolve).reject).toBe('missing_signature');
    expect(verifyA2AEnvelope({ ...partial, signature: 'a'.repeat(64) }, resolve).reject).toBe(
      'missing_keyid'
    );
    expect(
      verifyA2AEnvelope({ ...partial, signature: 'a'.repeat(64), keyId: 'k1' }, resolve).reject
    ).toBe('missing_nonce');
    expect(
      verifyA2AEnvelope(
        { ...partial, signature: 'a'.repeat(64), keyId: 'k1', nonce: randomNonce() },
        resolve
      ).reject
    ).toBe('missing_expiresat');
  });

  it('audits a replay attempt distinctly from a bad signature', () => {
    const signed = signA2AEnvelope(baseEnvelope(), KEY_TABLE.k1, 'k1');
    expect(verifyA2AEnvelope(signed, resolve).ok).toBe(true);
    const replay = verifyA2AEnvelope(signed, resolve);
    expect(replay.ok).toBe(false);
    expect(replay.reject).toBe('replay');
  });
});

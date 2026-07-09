/**
 * Integration tests — A2A envelope serialization + signed-RPC round-trip.
 *
 * Covers the Phase-13 A2A++ transport contract:
 *   - build a typed A2AEnvelopeExt, JSON serialize/deserialize, re-parse (strict)
 *   - sign with a shared secret and verify (HMAC + replay + TTL)
 *   - tamper detection (bad signature)
 *   - DagEvent round-trip
 *
 * Pure (no DB, no network). No FROZEN files touched.
 */

import { describe, expect, it } from 'vitest';
import {
  A2AEnvelopeExtSchema,
  DagEventSchema,
  parseA2AEnvelopeExt,
  parseDagEvent,
  signA2AEnvelope,
  verifyA2AEnvelope,
  type A2AEnvelopeExt,
  type DagEvent,
} from '@agentic-os/a2a-server';

const SECRETS: Record<string, string> = {
  'key-1': 'super-secret-shared-key-for-agent-a',
};

function baseEnvelope(over: Partial<A2AEnvelopeExt> = {}): A2AEnvelopeExt {
  return {
    taskId: 'task-42',
    traceId: 'trace-abc',
    blackboardRefs: [{ key: 'bb:wf:shared', access: 'read' }],
    channel: { role: 'worker' },
    payload: { instruction: 'summarize', items: [1, 2, 3] },
    sender: 'agent-a',
    timestamp: new Date('2026-07-09T00:00:00.000Z').toISOString(),
    ...over,
  };
}

describe('A2A envelope — serialize / deserialize round-trip', () => {
  it('survives JSON round-trip and strict re-parse', () => {
    const env = baseEnvelope();
    const json = JSON.stringify(env);
    const back = JSON.parse(json) as unknown;
    const parsed = parseA2AEnvelopeExt(back);

    expect(parsed.taskId).toBe('task-42');
    expect(parsed.sender).toBe('agent-a');
    expect(parsed.payload).toMatchObject({ instruction: 'summarize' });
    expect(A2AEnvelopeExtSchema.safeParse(parsed).success).toBe(true);
  });

  it('rejects an envelope missing required fields (strict schema)', () => {
    const bad = { taskId: 'x', sender: 'y' };
    const res = A2AEnvelopeExtSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });
});

describe('A2A signed-RPC — sign / verify', () => {
  it('signs and verifies an envelope within TTL', () => {
    const env = baseEnvelope();
    const signed = signA2AEnvelope(env, SECRETS['key-1'], 'key-1');
    expect(signed.signature).toBeDefined();
    expect(signed.nonce).toBeDefined();
    expect(signed.expiresAt).toBeDefined();

    const result = verifyA2AEnvelope(signed, (id) => SECRETS[id]);
    expect(result.ok).toBe(true);
    expect(result.sender).toBe('agent-a');
  });

  it('rejects a tampered payload (bad signature)', () => {
    const signed = signA2AEnvelope(baseEnvelope(), SECRETS['key-1'], 'key-1');
    const tampered: A2AEnvelopeExt = {
      ...signed,
      payload: { instruction: 'exfiltrate' },
    };
    const result = verifyA2AEnvelope(tampered, (id) => SECRETS[id]);
    expect(result.ok).toBe(false);
    expect(result.reject).toBe('bad_signature');
  });

  it('rejects an unknown key id', () => {
    const signed = signA2AEnvelope(baseEnvelope(), SECRETS['key-1'], 'key-1');
    const result = verifyA2AEnvelope(signed, () => undefined);
    expect(result.ok).toBe(false);
    expect(result.reject).toBe('unknown_key');
  });

  it('rejects an expired envelope', () => {
    const now = new Date('2026-07-09T00:00:00.000Z');
    const past = new Date('2026-07-08T00:00:00.000Z');
    const signed = signA2AEnvelope(baseEnvelope(), SECRETS['key-1'], 'key-1', {
      now: past,
      ttlMs: 1000,
    });
    const result = verifyA2AEnvelope(signed, (id) => SECRETS[id], { now });
    expect(result.ok).toBe(false);
    expect(result.reject).toBe('expired');
  });

  it('rejects a replayed nonce within the cache window', () => {
    const signed = signA2AEnvelope(baseEnvelope(), SECRETS['key-1'], 'key-1');
    const first = verifyA2AEnvelope(signed, (id) => SECRETS[id]);
    expect(first.ok).toBe(true);
    const second = verifyA2AEnvelope(signed, (id) => SECRETS[id]);
    expect(second.ok).toBe(false);
    expect(second.reject).toBe('replay');
  });
});

describe('DagEvent — serialize / deserialize round-trip', () => {
  it('round-trips a dag event through strict parse', () => {
    const evt: DagEvent = {
      workflowId: 'dag-1',
      nodeId: 'n1',
      status: 'running',
      ts: new Date('2026-07-09T00:00:00.000Z').toISOString(),
      traceId: 'trace-abc',
    };
    const back = JSON.parse(JSON.stringify(evt)) as unknown;
    const parsed = parseDagEvent(back);
    expect(parsed.nodeId).toBe('n1');
    expect(parsed.status).toBe('running');
    expect(DagEventSchema.safeParse(parsed).success).toBe(true);
  });
});

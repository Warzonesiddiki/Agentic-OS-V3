/**
 * session-recorder.ts — records agent/operator session activity as an immutable
 * event stream (append-only). Used for forensic replay and compliance. Each
 * record is content-hashed (sha256 of prior hash + payload) to form a tamper-evident chain.
 */
import { createHash } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { appendAudit, Tx } from '../lib/audit.js';
import { db } from '../db/client.js';

export interface SessionRecord {
  seq: number;
  sessionId: string;
  ts: number;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

const chains = new Map<string, SessionRecord[]>();

function hashRecord(rec: Omit<SessionRecord, 'hash'>, prevHash: string): string {
  const canonical = JSON.stringify({ ...rec, prevHash });
  return createHash('sha256').update(canonical).digest('hex');
}

export function record(
  sessionId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown> = {}
): SessionRecord {
  const chain = chains.get(sessionId) ?? [];
  const seq = chain.length + 1;
  const prevHash = chain.length ? chain[chain.length - 1]!.hash : 'GENESIS';
  const base: Omit<SessionRecord, 'hash'> = {
    seq,
    sessionId,
    ts: Date.now(),
    actor,
    action,
    payload,
    prevHash,
  };
  const hash = hashRecord(base, prevHash);
  const rec: SessionRecord = { ...base, hash };
  chain.push(rec);
  chains.set(sessionId, chain);
  void appendAudit('session.record', { sessionId, seq, action, hash }, actor, db as unknown as Tx);
  return rec;
}

/** Verify the chain integrity for a session. Returns false on any tampering. */
export function verifyChain(sessionId: string): boolean {
  const chain = chains.get(sessionId) ?? [];
  let prev = 'GENESIS';
  for (const rec of chain) {
    if (rec.prevHash !== prev) return false;
    const { hash: _omit, ...rest } = rec;
    const expect = hashRecord(rest, prev);
    if (expect !== rec.hash) return false;
    prev = rec.hash;
  }
  return true;
}

export function replay(sessionId: string): SessionRecord[] {
  const chain = chains.get(sessionId);
  if (!chain) throw new ApiError('SESSION_NOT_FOUND', `No session ${sessionId}`);
  return [...chain];
}

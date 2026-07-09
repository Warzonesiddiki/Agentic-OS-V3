/**
 * audit-engine.test.ts — unit tests for the provenance & governance engine
 * (Aegis namespace).
 *
 * The module mixes pure helpers (redaction, state hashing) with DB-backed
 * async functions (trajectory + tool receipts, auto-kill). To exercise the real
 * branching logic without the native better-sqlite3 binding, the DB, the audit
 * append/verify helpers, and the SIEM forwarder are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, module-scope capture of inserted rows so tests can inspect them.
const insertedRows: unknown[] = [];
vi.mock('../../src/db/client.js', () => {
  const chain = {
    values: vi.fn((row: unknown) => {
      insertedRows.push(row);
      return chain;
    }),
    onConflictDoUpdate: vi.fn(() => Promise.resolve()),
  };
  return {
    db: {
      insert: vi.fn(() => chain),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    },
    trajectoryLogs: {},
    toolReceipts: {},
    systemMeta: { key: 'killSwitch' },
  };
});
vi.mock('../../src/lib/audit.js', () => ({
  appendAudit: vi.fn(async (_action: string, _payload: unknown, _actor: string) => ({ sequence: 1 })),
  verifyAuditChain: vi.fn(async () => ({ valid: true })),
  GENESIS_HASH: '0'.repeat(64),
}));
vi.mock('../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(async () => undefined),
}));

import {
  redactSecrets,
  redactPayload,
  hashState,
  logTrajectory,
  logToolReceipt,
  verifyAndAutoKill,
} from '../../src/services/audit-engine.js';
import { appendAudit, verifyAuditChain } from '../../src/lib/audit.js';
import { forward } from '../../src/services/siem-forwarder.js';
import { db } from '../../src/db/client.js';

const mockedAppend = vi.mocked(appendAudit);
const mockedVerify = vi.mocked(verifyAuditChain);
const mockedForward = vi.mocked(forward);
const mockedDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
  mockedAppend.mockResolvedValue({ sequence: 7 } as never);
  mockedVerify.mockResolvedValue({ valid: true } as never);
});

describe('redactSecrets', () => {
  it('redacts OpenAI-style keys', () => {
    expect(redactSecrets('token sk-abcdEFGH1234567890xyz==')).toContain('***REDACTED***');
  });
  it('redacts AWS access keys', () => {
    expect(redactSecrets('key AKIAIOSFODNN7EXAMPLE')).toContain('***REDACTED***');
  });
  it('redacts github tokens', () => {
    expect(redactSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toContain('***REDACTED***');
  });
  it('redacts pem private keys', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    expect(redactSecrets(pem)).toContain('***REDACTED***');
  });
  it('redacts password= assignments', () => {
    expect(redactSecrets("password='hunter2secret'")).toContain('***REDACTED***');
  });
  it('leaves benign text untouched', () => {
    const text = 'the quick brown fox jumped over 12345';
    expect(redactSecrets(text)).toBe(text);
  });
  it('is idempotent (no double-redaction artifacts)', () => {
    const once = redactSecrets('sk-SOMELONGKEY1234567890abcdefgh');
    expect(redactSecrets(once)).toBe(once);
  });
});

describe('redactPayload', () => {
  it('redacts string values', () => {
    expect(redactPayload('sk-SOMELONGKEY1234567890abcdefgh')).toContain('***REDACTED***');
  });
  it('redacts arrays element-wise', () => {
    const out = redactPayload(['sk-SOMELONGKEY1234567890abcdefgh', 'keep']) as string[];
    expect(out[0]).toContain('***REDACTED***');
    expect(out[1]).toBe('keep');
  });
  it('redacts object values by key name (secret/password/token/api_key)', () => {
    const out = redactPayload({ secret: 'x', password: 'y', token: 'z', api_key: 'w', ok: 'keep' }) as Record<
      string,
      string
    >;
    expect(out.secret).toBe('***REDACTED***');
    expect(out.password).toBe('***REDACTED***');
    expect(out.token).toBe('***REDACTED***');
    expect(out.api_key).toBe('***REDACTED***');
    expect(out.ok).toBe('keep');
  });
  it('recurses into nested objects', () => {
    const out = redactPayload({ a: { token: 't', b: { password: 'p' } } }) as Record<string, Record<string, string>>;
    expect(out.a.token).toBe('***REDACTED***');
    expect(out.a.b.password).toBe('***REDACTED***');
  });
  it('passes through primitives unchanged', () => {
    expect(redactPayload(42)).toBe(42);
    expect(redactPayload(null)).toBe(null);
    expect(redactPayload(true)).toBe(true);
  });
  it('deep clones (does not mutate input)', () => {
    const input = { token: 't', nested: { keep: 'v' } };
    redactPayload(input);
    expect(input.token).toBe('t');
  });
});

describe('hashState', () => {
  it('is a sha256 hex digest', () => {
    const h = hashState('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    expect(hashState('state-xyz')).toBe(hashState('state-xyz'));
  });
  it('differs for different inputs', () => {
    expect(hashState('a')).not.toBe(hashState('b'));
  });
});

describe('logTrajectory', () => {
  it('appends an audit entry then writes a trajectory row', async () => {
    const res = await logTrajectory(
      {
        agentId: 'a1',
        model: 'm1',
        promptSent: 'sk-SOMELONGKEY1234567890abcdefgh',
        tokenUsage: { prompt: 1, completion: 2, total: 3 },
        latencyMs: 5,
      },
      'actor-1'
    );
    expect(mockedAppend).toHaveBeenCalledOnce();
    // Prompt is redacted before storage.
    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(String(inserted.promptSent)).toContain('***REDACTED***');
    expect(res.auditSequence).toBe(7);
    expect(res.trajectoryId.startsWith('trj_')).toBe(true);
  });

  it('defaults optional fields', async () => {
    await logTrajectory({ agentId: 'a', model: 'm', promptSent: 'plain' }, 'actor');
    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(inserted.responseReceived).toBe('');
    expect(inserted.latencyMs).toBe(0);
  });
});

describe('logToolReceipt', () => {
  it('hashes pre/post state and links to an audit entry', async () => {
    const res = await logToolReceipt(
      {
        agentId: 'a1',
        tool: 'vfs.write',
        target: '/x',
        preState: 'before',
        postState: 'after',
        exitCode: 0,
        authorized: true,
      },
      'actor-1'
    );
    expect(mockedAppend).toHaveBeenCalledOnce();
    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(inserted.preHash).toBe(hashState('before'));
    expect(inserted.postHash).toBe(hashState('after'));
    expect(inserted.authorized).toBe(true);
    expect(res.receiptId.startsWith('rcp_')).toBe(true);
  });

  it('treats missing pre/post state as null hashes', async () => {
    await logToolReceipt({ agentId: 'a', tool: 't', authorized: false }, 'actor');
    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(inserted.preHash).toBeNull();
    expect(inserted.postHash).toBeNull();
  });
});

describe('verifyAndAutoKill', () => {
  it('returns healthy when the chain is valid', async () => {
    mockedVerify.mockResolvedValue({ valid: true } as never);
    const res = await verifyAndAutoKill();
    expect(res.healthy).toBe(true);
    expect(mockedForward).not.toHaveBeenCalled();
  });

  it('auto-engages kill switch on tamper: forwards SIEM + writes systemMeta + appends audit', async () => {
    mockedVerify.mockResolvedValue({ valid: false, brokenAt: 5 } as never);
    const res = await verifyAndAutoKill();
    expect(res.healthy).toBe(false);
    expect(res.reason).toContain('#5');
    // SIEM forward fired with the chain_tamper critical event.
    expect(mockedForward).toHaveBeenCalledOnce();
    const fwdArg = mockedForward.mock.calls[0][0] as { kind: string; severity: string };
    expect(fwdArg.kind).toBe('audit.chain_tamper');
    expect(fwdArg.severity).toBe('critical');
    // systemMeta written for killSwitch + killSwitchReason.
    expect(mockedDb.insert).toHaveBeenCalled();
    // The auto-kill engagement is appended as its own audit entry.
    expect(mockedAppend).toHaveBeenCalledTimes(1);
    expect(mockedAppend).toHaveBeenCalledWith('safety.auto_kill_engaged', expect.any(Object), 'system-auto');
  });
});

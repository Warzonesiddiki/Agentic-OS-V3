/**
 * Aegis audit-chain integrity — SecC (nonstop perfection).
 *
 * Proves:
 *  - Hash-chain tamper detection: mutating a stored entry breaks verification.
 *  - Append-only enforcement: the chain tip only advances; re-verifying after a
 *    legit append keeps the prior entries valid.
 *  - Idempotent audit-worker under CONCURRENT writes: many simultaneous
 *    deliveries of the same logical event collapse to a single append.
 *
 * No Postgres required — the `db` driver is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const obj = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
        .join(',') +
      '}'
    );
  }
  const inserted: Record<string, unknown[]> = {};
  let auditRows: any[] = [];

  const mockDb = {
    select: vi.fn(() => {
      let fromTable = '';
      let whereCalled = false;
      const chainObj: any = {
        from: (t: { name?: string }) => {
          fromTable = t?.name ?? '';
          return chainObj;
        },
        where: () => {
          whereCalled = true;
          return chainObj;
        },
        orderBy: () => chainObj,
        limit: () => chainObj,
        then: (resolve: (v: any) => void) => {
          if (fromTable === 'merkle_checkpoints') return resolve([]);
          if (fromTable === 'audit_log') {
            if (whereCalled) return resolve(auditRows);
            const rows = inserted['audit_log'] ?? [];
            return resolve(rows.length ? [rows[rows.length - 1]] : []);
          }
          return resolve([]);
        },
      };
      return chainObj;
    }),
    insert: vi.fn((table: { name?: string }) => {
      const tableName = table?.name ?? 'unknown';
      inserted[tableName] = inserted[tableName] ?? [];
      return {
        values: (row: any) => {
          inserted[tableName].push(row);
          return { returning: () => [{ ...row }] };
        },
      };
    }),
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockDb)),
    execute: vi.fn(),
  };

  return {
    makeMockState: () => ({ inserted, setAuditRows: (r: any[]) => (auditRows = r) }),
    mockDb,
  };
});

vi.mock('../src/db/client.js', () => ({
  db: h.mockDb,
  isSqlite: false,
  auditLog: { name: 'audit_log' },
  merkleCheckpoints: { name: 'merkle_checkpoints' },
}));

import { appendAudit, GENESIS_HASH, setUseWorkerThread, verifyAuditChain } from '../src/lib/audit.js';
import { recordAuditEventIdempotent, resetAuditDedup } from '../src/services/audit-worker.js';

setUseWorkerThread(false);

beforeEach(() => {
  const state = h.makeMockState();
  for (const k of Object.keys(state.inserted)) delete state.inserted[k];
  state.setAuditRows([]);
  resetAuditDedup();
  vi.clearAllMocks();
});

async function appendReal(action: string, payload: unknown, actor = 'tester') {
  return appendAudit(action, payload, actor);
}

describe('Aegis: hash-chain tamper detection', () => {
  it('verification FAILS when a stored entry is mutated', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    // Mutate e2 in the "stored" set (simulating a tampered DB row).
    const tampered = { ...e2, payload: { n: 999, tampered: true } };
    h.makeMockState().setAuditRows([e1, tampered, e3]);

    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('verification FAILS when a prevHash link is rewired', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    const forked = { ...e3, prevHash: '0'.repeat(64) };
    h.makeMockState().setAuditRows([e1, e2, forked]);

    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
  });

  it('verification PASSES for an unmodified chain', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    h.makeMockState().setAuditRows([e1, e2, e3]);

    const result = await verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });
});

describe('Aegis: append-only enforcement', () => {
  it('a legitimate append keeps all prior entries valid and advances the tip', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    h.makeMockState().setAuditRows([e1, e2]);
    expect((await verifyAuditChain()).valid).toBe(true);

    // Append a NEW legitimate entry — extend, never rewrite history.
    const e3 = await appendReal('action.3', { n: 3 });
    h.makeMockState().setAuditRows([e1, e2, e3]);
    const after = await verifyAuditChain();
    expect(after.valid).toBe(true);
    expect(after.total).toBe(3);
    // The new entry links to the prior tip's hash (no history rewrite).
    expect(e3.prevHash).toBe(e2.entryHash);
  });

  it('cannot rewrite a past entry without breaking the successor link', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    // If someone "appends" a different e1 with the same sequence but new hash,
    // e2's prevHash (which points at the ORIGINAL e1 hash) no longer matches.
    const forged = { ...e1, payload: { n: 1, forged: true } };
    h.makeMockState().setAuditRows([forged, e2]);
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
  });
});

describe('Aegis: idempotent audit-worker under CONCURRENT writes', () => {
  it('collapses N concurrent deliveries of the same event into ONE append', async () => {
    const ev = { actor: 'tester', action: 'agent.task_done', payload: { taskId: 't1' }, createdAtMs: 1700000000000 };
    // No external lookup -> relies purely on in-process dedup + in-flight coalescing.
    const promises = Array.from({ length: 25 }, () => recordAuditEventIdempotent(ev));
    const results = await Promise.all(promises);

    const recorded = results.filter((r) => r.recorded).length;
    const duplicates = results.filter((r) => !r.recorded).length;
    expect(recorded).toBe(1);
    expect(duplicates).toBe(24);
    // Exactly one row written to the audit log regardless of concurrency.
    expect(h.makeMockState().inserted['audit_log']?.length ?? 0).toBe(1);
  });

  it('distinct events each append exactly once under concurrency', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      actor: 'tester',
      action: 'agent.task_done',
      payload: { taskId: `t${i}` },
      createdAtMs: 1700000000000,
    }));
    const promises = events.map((ev) => recordAuditEventIdempotent(ev));
    await Promise.all(promises);
    expect(h.makeMockState().inserted['audit_log']?.length ?? 0).toBe(10);
  });
});

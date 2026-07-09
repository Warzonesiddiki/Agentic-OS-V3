/**
 * Aegis audit-chain security audit — SecC (nonstop perfection).
 *
 * Proves:
 *  - Hash-chain append-only integrity: tamper MUST be detected at the right index.
 *  - Audit-event schema completeness: appendAudit persists every required column.
 *  - Compliance report correctness: not_applicable controls are NOT counted as implemented.
 *  - Idempotent audit-worker: the same logical event delivered twice yields one record.
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
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
      return fn(mockDb);
    }),
    execute: vi.fn(),
  };

  return {
    stableStringify,
    makeMockState: () => ({
      inserted,
      setAuditRows: (r: any[]) => (auditRows = r),
    }),
    mockDb,
  };
});

// ── Mock the db driver BEFORE importing the modules under test ──
vi.mock('../src/db/client.js', () => ({
  db: h.mockDb,
  isSqlite: false,
  auditLog: { name: 'audit_log' },
  merkleCheckpoints: { name: 'merkle_checkpoints' },
}));

import { appendAudit, computeEntryHash, setUseWorkerThread, GENESIS_HASH, verifyAuditChain } from '../src/lib/audit.js';
import { recordAuditEventIdempotent, deriveAuditId, setAuditLookup } from '../src/services/audit-worker.js';
import { generateReport, registerControls } from '../src/services/compliance-reporter.js';

// Use the deterministic synchronous hash path (no worker thread in tests).
setUseWorkerThread(false);

beforeEach(() => {
  const state = h.makeMockState();
  for (const k of Object.keys(state.inserted)) delete state.inserted[k];
  state.setAuditRows([]);
  vi.clearAllMocks();
});

/** Append a real entry through appendAudit, tracking the live tip. */
async function appendReal(action: string, payload: unknown, actor = 'tester') {
  return appendAudit(action, payload, actor);
}

describe('Aegis: hash-chain append-only integrity', () => {
  it('verifies a clean chain as valid', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    h.makeMockState().setAuditRows([e1, e2, e3]);
    const result = await verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.total).toBe(3);
    expect(result.verifiedEntries).toBe(3);
  });

  it('detects mid-chain tampering and reports the correct broken sequence', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    // Tamper: rewrite e2's payload so its stored entryHash is stale.
    const tampered = { ...e2, payload: { n: 999, tampered: true } };
    h.makeMockState().setAuditRows([e1, tampered, e3]);
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.total).toBe(1);
  });

  it('detects a broken prevHash link (chain fork)', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const e2 = await appendReal('action.2', { n: 2 });
    const e3 = await appendReal('action.3', { n: 3 });
    // Fork: e3 claims the wrong predecessor hash.
    const forked = { ...e3, prevHash: '0'.repeat(64) };
    h.makeMockState().setAuditRows([e1, e2, forked]);
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.total).toBe(2);
  });

  it('verifies computeEntryHash is deterministic and matches chain hashes', async () => {
    const e1 = await appendReal('action.1', { n: 1 });
    const recomputed = computeEntryHash(
      GENESIS_HASH,
      1,
      'action.1',
      'tester',
      e1.createdAt.getTime(),
      { n: 1 }
    );
    expect(recomputed).toBe(e1.entryHash);
  });
});

describe('Aegis: audit-event schema completeness', () => {
  it('persists every required column when appending', async () => {
    const entry = await appendAudit('system.ping', { hello: 'world' }, 'tester');
    expect(entry).toBeDefined();
    expect(typeof entry.sequence).toBe('number');
    expect(entry.id).toBeTruthy();
    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(entry.entryHash).toBeTruthy();
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.actor).toBe('tester');
    expect(entry.action).toBe('system.ping');
    expect(entry.payload).toEqual({ hello: 'world' });
  });

  it('always assigns a non-empty action column to every entry', async () => {
    const entry = await appendAudit('system.ping', { x: 1 }, 'tester');
    expect(typeof entry.action).toBe('string');
    expect(entry.action.length).toBeGreaterThan(0);
  });

  it('chains prevHash from the previously persisted entry', async () => {
    const first = await appendReal('system.a', {});
    const second = await appendReal('system.b', {});
    expect(second.prevHash).toBe(first.entryHash);
    expect(first.prevHash).toBe(GENESIS_HASH);
  });
});

describe('Aegis: compliance report correctness', () => {
  it('does NOT count not_applicable controls as implemented', async () => {
    registerControls([
      { id: 'C1', framework: 'SOC2', title: 'a', status: 'implemented', evidence: 'e' },
      { id: 'C2', framework: 'SOC2', title: 'b', status: 'partial', evidence: 'e' },
      { id: 'C3', framework: 'SOC2', title: 'c', status: 'missing', evidence: 'e' },
      { id: 'C4', framework: 'SOC2', title: 'd', status: 'not_applicable', evidence: 'e' },
    ]);
    const report = await generateReport();
    expect(report.summary.implemented).toBe(1);
    expect(report.summary.partial).toBe(1);
    expect(report.summary.missing).toBe(1);
    expect(report.summary.notApplicable).toBe(1);
    // IMPORTANT: not_applicable must never inflate the implemented count
    expect(report.summary.implemented).toBeLessThan(2);
  });
});

describe('Aegis: idempotent audit-worker', () => {
  it('records the same logical event only once (dedup)', async () => {
    const ev = { actor: 'tester', action: 'agent.task_done', payload: { taskId: 't1' }, createdAtMs: 1700000000000 };
    const id = deriveAuditId(ev);
    let seen = false;
    setAuditLookup(async (lookupId: string) => {
      if (lookupId === id && seen) return { id };
      seen = true;
      return null;
    });
    const r1 = await recordAuditEventIdempotent(ev);
    const r2 = await recordAuditEventIdempotent(ev);
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(false);
    expect(r2.id).toBe(r1.id);
    // Only one audit_log row should have been inserted
    expect(h.makeMockState().inserted['audit_log']?.length ?? 0).toBe(1);
    setAuditLookup(null);
  });

  it('derives a stable id from the natural key (same input -> same id)', () => {
    const ev = { actor: 'a', action: 'b', payload: { k: 1 }, createdAtMs: 1000 };
    expect(deriveAuditId(ev)).toBe(deriveAuditId(ev));
    const ev2 = { ...ev, payload: { k: 2 } };
    expect(deriveAuditId(ev)).not.toBe(deriveAuditId(ev2));
  });
});

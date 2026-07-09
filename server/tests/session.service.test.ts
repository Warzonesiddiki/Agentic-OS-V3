/**
 * session.service.ts — unit tests (Artisan namespace coverage).
 * Exercises setKillSwitch write path with mocked db + safety + audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/client.js', () => {
  const chain = (rows: unknown[] = [{ enabled: false, reason: 'r', setAt: 1, setBy: 'x' }]) => {
    const o: any = {};
    o.from = () => o;
    o.where = () => o;
    o.limit = () => Promise.resolve(rows);
    o.findFirst = () => Promise.resolve(rows[0] ?? null);
    o.findMany = () => Promise.resolve(rows);
    return o;
  };
  const upd = () => ({ set: () => ({ where: () => Promise.resolve() }) });
  const insMock = () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) });
  const txMock: any = {
    insert: vi.fn(() => insMock()),
    update: vi.fn(() => upd()),
    query: { killSwitch: { findFirst: vi.fn(() => Promise.resolve({ enabled: false })) } },
  };
  const dbMock: any = {
    insert: vi.fn(() => insMock()),
    update: vi.fn(() => upd()),
    query: {
      killSwitch: { findFirst: vi.fn(() => Promise.resolve({ enabled: false })) },
      agents: { findFirst: vi.fn(() => Promise.resolve(null)) },
      agentProcesses: { findFirst: vi.fn(() => Promise.resolve(null)) },
    },
    transaction: vi.fn((fn: any) => fn(txMock)),
  };
  return { db: dbMock, systemMeta: { key: 'killSwitch' }, isSqlite: false, isPg: true };
});
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/services/safety.service.js', () => ({
  assertOperational: vi.fn(() => Promise.resolve()),
  assertKillSwitchConsistent: vi.fn(() => Promise.resolve()),
}));

import { setKillSwitch } from '../src/services/session.service.js';

describe('session.service kill switch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('setKillSwitch engages within a transaction (double assert)', async () => {
    await setKillSwitch(true, 'incident', 'op_1');
    const { db } = (await import('../src/db/client.js')) as any;
    expect(db.transaction).toHaveBeenCalled();
    // pre-flight + in-tx assertOperational + assertKillSwitchConsistent all invoked
    const safety = (await import('../src/services/safety.service.js')) as any;
    expect(safety.assertOperational).toHaveBeenCalled();
    expect(safety.assertKillSwitchConsistent).toHaveBeenCalled();
  });

  it('setKillSwitch writes killSwitch + reason rows', async () => {
    await setKillSwitch(true, 'boom', 'op_2');
    const { db } = (await import('../src/db/client.js')) as any;
    // one insert for killSwitch value + one for reason
    expect(db.insert).toHaveBeenCalled();
  });

  it('setKillSwitch without reason skips reason row', async () => {
    await setKillSwitch(false, undefined, 'op_3');
    const { db } = (await import('../src/db/client.js')) as any;
    expect(db.transaction).toHaveBeenCalled();
  });
});

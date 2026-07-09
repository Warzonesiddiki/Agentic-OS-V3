/**
 * session.service.ts — unit tests (Artisan namespace coverage).
 * Exercises setKillSwitch write path with mocked db + safety + audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = (rows: unknown[] = [{ enabled: false, reason: 'r', setAt: 1, setBy: 'x' }]) => {
  const o: any = {};
  o.from = () => o;
  o.where = () => o;
  o.limit = () => Promise.resolve(rows);
  o.findFirst = () => Promise.resolve(rows[0] ?? null);
  o.findMany = () => Promise.resolve(rows);
  return o;
};
const returningChain = (rows: unknown[] = [{}]) => {
  const p: any = Promise.resolve(rows);
  p.$dynamic = () => Promise.resolve(rows);
  return p;
};
const txMock: any = {
  select: vi.fn(() => chain()),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) }) }) }),
  query: { killSwitch: { findFirst: vi.fn(() => Promise.resolve({ enabled: false })) } },
};
const dbMock: any = {
  select: vi.fn(() => chain()),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) }) })),
  query: {
    killSwitch: { findFirst: vi.fn(() => Promise.resolve({ enabled: false })) },
    agents: { findFirst: vi.fn(() => Promise.resolve(null)) },
    agentProcesses: { findFirst: vi.fn(() => Promise.resolve(null)) },
  },
  transaction: vi.fn((fn: any) => fn(txMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/services/safety.service.js', () => ({
  assertOperational: vi.fn(() => Promise.resolve()),
  assertKillSwitchConsistent: vi.fn(() => Promise.resolve()),
}));

import { setKillSwitch, getKillSwitch, armKillSwitch } from '../src/services/session.service.js';

describe('session.service kill switch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('setKillSwitch engages within a transaction', async () => {
    const r = await setKillSwitch(true, 'incident', 'op_1');
    expect(r.enabled).toBe(true);
    expect(dbMock.transaction).toHaveBeenCalled();
  });

  it('getKillSwitch reads current state', async () => {
    const s = await getKillSwitch();
    expect(s.enabled).toBe(false);
  });

  it('armKillSwitch references current state', async () => {
    const r = await armKillSwitch('op_1');
    expect(typeof r.enabled).toBe('boolean');
  });
});

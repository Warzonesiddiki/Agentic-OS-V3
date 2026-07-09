/**
 * project.service.ts — unit tests (Artisan namespace coverage).
 * transferProject + ensureProject write paths (db mocked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const returningChain = (rows: unknown[] = [{}]) => {
  const p: any = Promise.resolve(rows);
  p.$dynamic = () => Promise.resolve(rows);
  return p;
};
const txMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })) })),
  query: { projects: { findFirst: vi.fn(() => Promise.resolve({ id: 'proj_1', ownerId: 'u1' })), findMany: vi.fn(() => Promise.resolve([])) }, skills: { findFirst: vi.fn(() => Promise.resolve(null)) }, memories: { findFirst: vi.fn(() => Promise.resolve(null)) } },
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
};
const dbMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()), returning: vi.fn(() => returningChain([{ id: 'proj_1' }])) })) })),
  query: { projects: { findFirst: vi.fn(() => Promise.resolve({ id: 'proj_1', ownerId: 'u1' })), findMany: vi.fn(() => Promise.resolve([])) }, skills: { findFirst: vi.fn(() => Promise.resolve(null)) }, memories: { findFirst: vi.fn(() => Promise.resolve(null)) } },
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  transaction: vi.fn((fn: any) => fn(txMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/services/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));

import { transferProject, ensureProject } from '../src/services/project.service.js';

describe('project.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('transferProject reassigns owner in a transaction', async () => {
    await transferProject('proj_1', 'u2', 'op');
    expect(txMock.update).toHaveBeenCalled();
    expect(dbMock.transaction).toHaveBeenCalled();
  });

  it('ensureProject creates when missing', async () => {
    txMock.query.projects.findFirst.mockResolvedValueOnce(null);
    const r = await ensureProject('new', 'owner', 'op');
    expect(r.id).toBe('proj_1');
  });

  it('ensureProject returns existing project', async () => {
    txMock.query.projects.findFirst.mockResolvedValueOnce({ id: 'proj_1', ownerId: 'u1' });
    const r = await ensureProject('proj_1', 'u1', 'op');
    expect(r.id).toBe('proj_1');
  });
});

/**
 * project.service.ts — unit tests (Artisan namespace coverage).
 * transferProject + ensureProject write paths (db mocked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const returningChain = (rows: unknown[] = [{ id: 'prj_1' }]) => {
  const p: any = Promise.resolve(rows);
  p.$dynamic = () => Promise.resolve(rows);
  return p;
};
const txMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => returningChain([{ id: 'prj_1' }])) })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  query: {
    projects: { findFirst: vi.fn(() => Promise.resolve({ id: 'prj_1', ownerId: 'u1' })) },
    skills: { findFirst: vi.fn(() => Promise.resolve(null)) },
  },
};
const dbMock: any = {
  insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => returningChain([{ id: 'prj_1' }])), returning: vi.fn(() => returningChain([{ id: 'prj_1' }])) })) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  query: { projects: { findFirst: vi.fn(() => Promise.resolve({ id: 'prj_1', ownerId: 'u1' })) }, skills: { findFirst: vi.fn(() => Promise.resolve(null)) } },
  transaction: vi.fn((fn: any) => fn(txMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/tokens.js', () => ({ estimateTokens: () => 5 }));
vi.mock('../src/services/safety.service.js', () => ({ assertOperational: vi.fn(() => Promise.resolve()) }));

import { transferProject, ensureProject } from '../src/services/project.service.js';

describe('project.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('transferProject: ensures project, inserts memories + skills, audits', async () => {
    const r = await transferProject(
      {
        projectName: 'proj_1',
        description: 'd',
        memories: [{ kind: 'note', title: 't', content: 'c' }],
        skills: [{ id: 's1', name: 'skillA', title: 'A', description: 'd', content: 'c', category: 'cat', tags: [], createdAt: new Date(), updatedAt: new Date() } as any],
      },
      'op'
    );
    expect(r.projectId).toBe('prj_1');
    expect(txMock.insert).toHaveBeenCalled();
    expect(dbMock.transaction).toHaveBeenCalled();
  });

  it('ensureProject creates when onConflict returns a row', async () => {
    const r = await ensureProject('new', 'transfer');
    expect(r.id).toBe('prj_1');
    expect(r.created).toBe(true);
  });

  it('ensureProject returns existing project when conflict (no row)', async () => {
    txMock.insert.mockReturnValueOnce({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => returningChain([])), returning: vi.fn(() => returningChain([])) })) });
    txMock.query.projects.findFirst.mockResolvedValueOnce({ id: 'prj_1', ownerId: 'u1' });
    const r = await ensureProject('proj_1', 'transfer');
    expect(r.id).toBe('prj_1');
    expect(r.created).toBe(false);
  });
});

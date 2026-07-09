import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: { selectResult: [] as any[], calls: [] as any[], backend: 'sqlite' } }));
vi.mock('../src/db/client.js', () => buildClientMock(store));
vi.mock('../src/services/safety.service.js', () => ({ assertOperational: vi.fn(async () => {}) }));

import { buildClientMock } from '../tests/helpers/db-chain.js';
import { applyBatch, bulkDelete, planBatch } from '../src/services/memory-batch.js';

const create = (id: string, text = 't'): any => ({ op: 'create', id, kind: 'note', text });
const update = (id: string, patch: any): any => ({ op: 'update', id, patch });
const del = (id: string): any => ({ op: 'delete', id });
const tag = (id: string, t: string): any => ({ op: 'tag', id, tag: t });

describe('memory-batch / applyBatch', () => {
  beforeEach(() => {
    store.calls.length = 0;
  });

  it('applies all valid ops and reports applied count', async () => {
    const res = await applyBatch('p1', [create('a'), update('a', { text: 'x' }), del('a'), tag('a', 't1')]);
    expect(res.applied).toBe(4);
    expect(res.failed).toBe(0);
    expect(res.errors).toHaveLength(0);
  });

  it('skirts invalid ops into the failed bucket without applying them', async () => {
    const res = await applyBatch('p1', [create('a'), create('a') /* duplicate id */]);
    expect(res.failed).toBe(1);
    expect(res.errors[0]!.message).toMatch(/duplicate id a/);
    expect(res.applied).toBe(1);
  });

  it('performs inserts inside a transaction', async () => {
    await applyBatch('p1', [create('a'), create('b')]);
    const inserts = store.calls.filter((c) => c.op === 'insert');
    expect(inserts.length).toBe(2);
  });

  it('performs soft-deletes via update with deletedAt', async () => {
    await applyBatch('p1', [del('a')]);
    const sets = store.calls.filter((c) => c.op === 'update');
    expect(sets.length).toBe(1);
  });
});

describe('memory-batch / bulkDelete', () => {
  beforeEach(() => {
    store.calls.length = 0;
  });

  it('returns 0 for empty id list (no DB call)', async () => {
    const n = await bulkDelete([]);
    expect(n).toBe(0);
    expect(store.calls.filter((c) => c.op === 'update').length).toBe(0);
  });

  it('issues a single update with deletedAt for the id set', async () => {
    const n = await bulkDelete(['a', 'b', 'c']);
    expect(n).toBe(3);
    const ups = store.calls.filter((c) => c.op === 'update');
    expect(ups.length).toBe(1);
  });
});

describe('memory-batch / planBatch (regression)', () => {
  it('flags malformed ops', () => {
    expect(planBatch([{ op: 'create', id: '', kind: 'note', text: 't' }]).length).toBe(1);
  });
});

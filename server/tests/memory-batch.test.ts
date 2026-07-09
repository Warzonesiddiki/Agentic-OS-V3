import { describe, it, expect } from 'vitest';
import { planBatch, type BatchOp } from '../src/services/memory-batch.js';

const create = (id: string, text = 't'): BatchOp => ({ op: 'create', id, kind: 'note', text });
const update = (id: string): BatchOp => ({ op: 'update', id });
const del = (id: string): BatchOp => ({ op: 'delete', id });
const tag = (id: string, t: string): BatchOp => ({ op: 'tag', id, tag: t });

describe('memory-batch / planBatch', () => {
  it('returns no errors for a valid mixed batch', () => {
    const errs = planBatch([create('a'), update('a'), del('a'), tag('a', 'x')]);
    expect(errs).toHaveLength(0);
  });

  it('flags create missing id/kind/text', () => {
    expect(planBatch([{ op: 'create', id: '', kind: 'note', text: 't' }])).toHaveLength(1);
    expect(planBatch([{ op: 'create', id: 'a', kind: '', text: 't' }])).toHaveLength(1);
    expect(planBatch([{ op: 'create', id: 'a', kind: 'note', text: '' }])).toHaveLength(1);
  });

  it('flags duplicate create ids', () => {
    const errs = planBatch([create('a'), create('a')]);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain('duplicate id a');
    expect(errs[0]!.index).toBe(1);
  });

  it('flags update/delete/tag missing id', () => {
    expect(planBatch([{ op: 'update', id: '' }])).toHaveLength(1);
    expect(planBatch([{ op: 'delete', id: '' }])).toHaveLength(1);
  });

  it('flags tag missing tag value', () => {
    expect(planBatch([{ op: 'tag', id: 'a', tag: '' }])).toHaveLength(1);
  });

  it('reports multiple errors with correct indices', () => {
    const errs = planBatch([create('a'), del(''), tag('b', '')]);
    expect(errs.map((e) => e.index).sort((x, y) => x - y)).toEqual([1, 2]);
  });
});

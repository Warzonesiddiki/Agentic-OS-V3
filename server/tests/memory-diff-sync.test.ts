/**
 * Tests for server/src/services/memory-diff-sync.ts
 *
 * Pure diff + sync of memory collections across replicas. No DB required.
 */
import { describe, it, expect } from 'vitest';
import { computeMemoryDiff, applyMemorySync, type MemorySnapshot } from '../src/services/memory-diff-sync.js';

const base: MemorySnapshot = {
  m1: { id: 'm1', title: 'A', content: 'x' },
  m2: { id: 'm2', title: 'B', content: 'y' },
  m3: { id: 'm3', title: 'C', content: 'z' },
};

describe('computeMemoryDiff', () => {
  it('detects added memories', () => {
    const remote: MemorySnapshot = { ...base, m4: { id: 'm4', title: 'D', content: 'w' } };
    const diff = computeMemoryDiff(base, remote);
    expect(diff.added.map((m) => m.id)).toEqual(['m4']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
  it('detects removed memories', () => {
    const remote: MemorySnapshot = { m1: base.m1, m2: base.m2 };
    const diff = computeMemoryDiff(base, remote);
    expect(diff.removed.map((m) => m.id)).toEqual(['m3']);
    expect(diff.added).toEqual([]);
  });
  it('detects changed memories by content', () => {
    const remote: MemorySnapshot = { ...base, m2: { id: 'm2', title: 'B', content: 'changed' } };
    const diff = computeMemoryDiff(base, remote);
    expect(diff.changed.map((m) => m.id)).toEqual(['m2']);
  });
  it('reports no diff for identical snapshots', () => {
    const diff = computeMemoryDiff(base, base);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
  it('detects both add and remove', () => {
    const remote: MemorySnapshot = { m1: base.m1, m4: { id: 'm4', title: 'D', content: 'w' } };
    const diff = computeMemoryDiff(base, remote);
    expect(diff.added.map((m) => m.id)).toEqual(['m4']);
    expect(diff.removed.map((m) => m.id)).toEqual(['m2', 'm3']);
  });
});

describe('applyMemorySync', () => {
  it('returns remote snapshot when strategy is overwrite', () => {
    const remote: MemorySnapshot = { m9: { id: 'm9', title: 'Z', content: 'q' } };
    const merged = applyMemorySync(base, remote, { strategy: 'overwrite' });
    expect(Object.keys(merged).sort()).toEqual(['m9']);
  });
  it('keeps local when strategy is local-wins', () => {
    const remote: MemorySnapshot = { ...base, m2: { id: 'm2', title: 'B', content: 'remote' } };
    const merged = applyMemorySync(base, remote, { strategy: 'local-wins' });
    expect(merged.m2.content).toBe('y');
  });
  it('prefers remote for changed items when strategy is remote-wins', () => {
    const remote: MemorySnapshot = { ...base, m2: { id: 'm2', title: 'B', content: 'remote' } };
    const merged = applyMemorySync(base, remote, { strategy: 'remote-wins' });
    expect(merged.m2.content).toBe('remote');
  });
  it('merges additions under local-wins', () => {
    const remote: MemorySnapshot = { ...base, m4: { id: 'm4', title: 'D', content: 'w' } };
    const merged = applyMemorySync(base, remote, { strategy: 'local-wins' });
    expect(merged.m4).toBeDefined();
  });
});

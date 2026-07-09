import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import {
  renameTagInList,
  buildTagTree,
  detectOrphanTagNodes,
  type TagNode,
} from '../src/services/memory-tag-taxonomy.js';

const node = (id: string, name: string, parentId: string | null = null): TagNode => ({
  id,
  name,
  parentId,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('memory-tag-taxonomy — renameTagInList', () => {
  it('renames matching tags and leaves others', () => {
    expect(renameTagInList(['a', 'b', 'c'], 'b', 'B')).toEqual(['a', 'B', 'c']);
  });
  it('is case-sensitive and returns a new array', () => {
    const input = ['x', 'y'];
    const out = renameTagInList(input, 'x', 'X');
    expect(out).toEqual(['X', 'y']);
    expect(input).toEqual(['x', 'y']);
  });
  it('no-ops when old name absent', () => {
    expect(renameTagInList(['a', 'b'], 'z', 'Z')).toEqual(['a', 'b']);
  });
});

describe('memory-tag-taxonomy — buildTagTree', () => {
  it('nests children under parents', () => {
    const nodes = [node('1', 'root', null), node('2', 'child', '1'), node('3', 'grand', '2')];
    const tree = buildTagTree(nodes);
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe('1');
    expect(tree[0].children[0].id).toBe('2');
    expect(tree[0].children[0].children[0].id).toBe('3');
  });
  it('keeps roots at top level', () => {
    const nodes = [node('a', 'A', null), node('b', 'B', null)];
    const tree = buildTagTree(nodes);
    expect(tree.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});

describe('memory-tag-taxonomy — detectOrphanTagNodes', () => {
  it('flags nodes whose id is not linked and name is not used', () => {
    const nodes = [node('1', 'root'), node('2', 'child'), node('3', 'orphan')];
    const orphans = detectOrphanTagNodes(nodes, new Set(['root', 'child']), new Set(['1', '2']));
    expect(orphans.map((o) => o.id)).toEqual(['3']);
  });
  it('returns empty when all nodes are linked or used', () => {
    const nodes = [node('1', 'root'), node('2', 'child')];
    expect(detectOrphanTagNodes(nodes, new Set(['root', 'child']), new Set(['1', '2']))).toEqual([]);
  });
});

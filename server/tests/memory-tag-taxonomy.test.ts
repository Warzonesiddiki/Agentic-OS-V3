import { describe, it, expect } from 'vitest';
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
  aliases: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

describe('memory-tag-taxonomy / renameTagInList', () => {
  it('renames exact matches and de-duplicates', () => {
    const out = renameTagInList(['a', 'b', 'a', 'c'], 'a', 'x');
    expect(out).toEqual(['x', 'b', 'c']);
  });

  it('leaves other tags untouched', () => {
    expect(renameTagInList(['alpha', 'beta'], 'alpha', 'gamma')).toEqual(['gamma', 'beta']);
  });

  it('handles empty list', () => {
    expect(renameTagInList([], 'a', 'b')).toEqual([]);
  });

  it('does not error when oldName absent', () => {
    expect(renameTagInList(['x', 'y'], 'z', 'w')).toEqual(['x', 'y']);
  });
});

describe('memory-tag-taxonomy / buildTagTree', () => {
  it('builds a two-level tree from flat nodes', () => {
    const tree = buildTagTree([node('r', 'root'), node('c1', 'child1', 'r'), node('c2', 'child2', 'r')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe('r');
    expect(tree[0]!.children.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('returns multiple roots when nodes have no parent', () => {
    const tree = buildTagTree([node('a', 'A'), node('b', 'B')]);
    expect(tree.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('nests arbitrarily deep', () => {
    const tree = buildTagTree([node('r', 'r'), node('m', 'm', 'r'), node('l', 'l', 'm')]);
    expect(tree[0]!.children[0]!.id).toBe('m');
    expect(tree[0]!.children[0]!.children[0]!.id).toBe('l');
  });

  it('returns empty for empty input', () => {
    expect(buildTagTree([])).toEqual([]);
  });
});

describe('memory-tag-taxonomy / detectOrphanTagNodes', () => {
  it('flags nodes neither linked by id nor used by name', () => {
    const nodes = [node('used', 'used'), node('linked', 'linked'), node('orphan', 'orphan')];
    const out = detectOrphanTagNodes(
      nodes,
      new Set(['used']), // usedNames
      new Set(['linked']) // linkedIds
    );
    expect(out.map((n) => n.id)).toEqual(['orphan']);
  });

  it('keeps a node that is used by name even if not linked by id', () => {
    const nodes = [node('a', 'active')];
    expect(detectOrphanTagNodes(nodes, new Set(['active']), new Set())).toEqual([]);
  });

  it('keeps a node linked by id even if name unused', () => {
    const nodes = [node('a', 'unused-name')];
    expect(detectOrphanTagNodes(nodes, new Set(), new Set(['a']))).toEqual([]);
  });
});

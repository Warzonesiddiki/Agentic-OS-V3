import { describe, it, expect } from 'vitest';
import {
  validateMemoryAgainstTemplate,
  applyTemplateToMemory,
  type MemoryTemplate,
  type MemoryTemplateSchema,
  type MemoryTemplateMemoryInput,
} from '../src/services/memory-templates.js';
import {
  renameTagInList,
  buildTagTree,
  detectOrphanTagNodes,
  type TagNode,
} from '../src/services/memory-tag-taxonomy.js';
import {
  hashMemory,
  computeExport,
  applyDiffToStore,
  type MemoryDiffSourceRow,
} from '../src/services/memory-diff-sync.js';
import { MemorySuggester } from '../src/routes/memory-search-suggest.js';

describe('memory templates', () => {
  const schema: MemoryTemplateSchema = {
    type: 'object',
    required: ['title', 'content'],
    properties: {
      title: { type: 'string', minLength: 3 },
      content: { type: 'string' },
      kind: { type: 'string' },
      importance: { type: 'number', default: 0.9 },
      language: { type: 'string', default: 'en' },
    },
  };

  it('validates a memory against a template', () => {
    const result = validateMemoryAgainstTemplate(schema, { title: 'abc', content: 'hello' });
    expect(result.valid).toBe(true);
    const bad = validateMemoryAgainstTemplate(schema, { title: 'ab', content: 5 });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('applies defaults when structuring a memory', () => {
    const template: MemoryTemplate = {
      id: 'mt_1',
      name: 'note',
      description: '',
      schema,
      isDefault: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const input: MemoryTemplateMemoryInput = {
      kind: 'fact',
      title: 'valid title',
      content: 'body',
    };
    const out = applyTemplateToMemory(template, input);
    expect(out.valid).toBe(true);
    expect(out.structured.importance).toBe(0.9);
    expect(out.structured.language).toBe('en');
    expect(out.structured.tags).toEqual([]);
  });
});

describe('tag taxonomy', () => {
  it('renames a tag within a memory tag list (cascade transform)', () => {
    const list = ['a', 'b', 'a', 'c'];
    expect(renameTagInList(list, 'a', 'x')).toEqual(['x', 'b', 'c']);
  });

  it('builds a tag tree from flat nodes', () => {
    const nodes: TagNode[] = [
      { id: '1', name: 'root', parentId: null, aliases: [], createdAt: '', updatedAt: '' },
      { id: '2', name: 'child', parentId: '1', aliases: [], createdAt: '', updatedAt: '' },
      { id: '3', name: 'orphan', parentId: 'missing', aliases: [], createdAt: '', updatedAt: '' },
    ];
    const tree = buildTagTree(nodes);
    expect(tree).toHaveLength(2);
    const root = tree.find((n) => n.id === '1');
    expect(root?.children).toHaveLength(1);
    expect(root?.children[0]?.id).toBe('2');
  });

  it('detects orphan tags', () => {
    const nodes: TagNode[] = [
      { id: '1', name: 'used', parentId: null, aliases: [], createdAt: '', updatedAt: '' },
      { id: '2', name: 'unused', parentId: null, aliases: [], createdAt: '', updatedAt: '' },
    ];
    const orphans = detectOrphanTagNodes(nodes, new Set(['used']), new Set(['1']));
    expect(orphans.map((n) => n.id)).toEqual(['2']);
  });
});

describe('diff sync', () => {
  it('round-trips an export and apply', () => {
    const sources: MemoryDiffSourceRow[] = [
      {
        id: 'm1',
        title: 'A',
        content: 'x',
        kind: 'fact',
        tags: ['t'],
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      },
      {
        id: 'm2',
        title: 'B',
        content: 'y',
        kind: 'fact',
        tags: [],
        updatedAt: new Date('2024-01-10T00:00:00Z'),
      },
    ];
    const since = new Date('2024-01-05T00:00:00Z');
    const diff = computeExport(sources, ['m0'], since);
    expect(diff.memories.map((m) => m.id)).toEqual(['m2']);
    expect(diff.deletedIds).toEqual(['m0']);

    const store = new Map<string, { id: string; updatedAt: string }>();
    store.set('m2', { id: 'm2', updatedAt: '2024-01-01T00:00:00Z' });
    store.set('m0', { id: 'm0', updatedAt: '2024-01-01T00:00:00Z' });
    const result = applyDiffToStore(store, diff);
    expect(result.upserted).toBe(1);
    expect(result.deleted).toBe(1);
    expect(store.has('m0')).toBe(false);
    expect(store.has('m2')).toBe(true);
  });

  it('hashes memory content deterministically', () => {
    const a = hashMemory({ title: 'T', content: 'C', tags: ['x'], kind: 'fact' });
    const b = hashMemory({ title: 'T', content: 'C', tags: ['x'], kind: 'fact' });
    expect(a).toBe(b);
  });
});

describe('suggest trie', () => {
  it('suggests titles by prefix with frequency boost', () => {
    const s = new MemorySuggester();
    s.insert('Project Alpha planning', 1);
    s.insert('Project Alpha budget', 5);
    s.insert('Project Beta', 1);
    const out = s.suggest('project alpha');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.title).toBe('Project Alpha budget');
  });

  it('returns empty for unknown prefix', () => {
    const s = new MemorySuggester();
    s.insert('Hello World', 1);
    expect(s.suggest('zzz')).toEqual([]);
  });
});

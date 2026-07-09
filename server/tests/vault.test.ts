/**
 * Dedicated unit tests for Sentinel's vault namespace.
 * Mocks db + fs-adjacent deps; exercises pure parseMarkdown + sync/write-back paths.
 * No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInsert = vi.fn(() => ({
  values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'v1' }])) })),
}));
const mockSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve([])),
  })),
}));
const mockUpdate = vi.fn(() => ({
  set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
}));

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    query: {
      notes: { findFirst: vi.fn(() => Promise.resolve(null)) },
      memories: {
        findFirst: vi.fn(() => Promise.resolve({ id: 'm1', title: 'T', content: 'B', tags: ['x'] })),
      },
    },
  },
  notes: { id: 'notes-id', path: 'path' },
  memories: { id: 'memories-id', title: 'title', content: 'content', tags: 'tags' },
}));

vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/lib/guards.js', () => {
  const path = require('node:path');
  return {
    safeVaultPath: (p: string, root: string) => ({
      ok: true,
      resolved: path.resolve(root, p.replace(/^\/+/, '')),
    }),
  };
});
vi.mock('../src/lib/env.js', () => ({
  env: { NEXUS_OBSIDIAN_VAULT: '/tmp/vault' },
}));
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(() => Promise.resolve([])),
  stat: vi.fn(() => Promise.resolve({ isDirectory: () => false, mtime: new Date() })),
  readFile: vi.fn(() => Promise.resolve('# Note\nhello #world')),
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));

import { parseMarkdown, syncVault, writeBack } from '../src/services/vault.js';

beforeEach(() => {
  mockInsert.mockClear();
  mockSelect.mockClear();
  mockUpdate.mockClear();
});

describe('parseMarkdown', () => {
  it('parses frontmatter and body', () => {
    const raw = `---\ntitle: Hello\ntags: [a, b]\n---\n# Body\nSome text.`;
    const parsed = parseMarkdown(raw);
    expect(parsed.title).toBe('Hello');
    expect(parsed.tags).toEqual(['a', 'b']);
    expect(parsed.content).toContain('Body');
    expect(parsed.frontmatter.title).toBe('Hello');
  });

  it('returns defaults for empty input', () => {
    const parsed = parseMarkdown('');
    expect(parsed.title).toBe('untitled');
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.content).toBe('');
  });

  it('handles missing frontmatter gracefully', () => {
    const parsed = parseMarkdown('just text');
    expect(parsed.content).toBe('just text');
    expect(parsed.title).toBe('untitled');
  });

  it('extracts inline #tags and wikilinks', () => {
    const parsed = parseMarkdown('note #project [[other-note]]');
    expect(parsed.tags).toContain('project');
    expect(parsed.wikilinks).toContain('other-note');
  });
});

describe('syncVault', () => {
  it('indexes notes and reports count', async () => {
    const result = await syncVault('tester');
    expect(result).toHaveProperty('indexed');
    expect(typeof result.indexed).toBe('number');
  });
});

describe('writeBack', () => {
  it('writes a note with audit trail', async () => {
    const result = await writeBack('m1', undefined, 'tester');
    expect(result).toBeDefined();
    expect(result.path).toContain('.md');
  });
});

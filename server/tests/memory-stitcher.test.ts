/**
 * Tests for server/src/services/memory-stitcher.ts
 *
 * Stitches related memory fragments into a coherent narrative. The LLM call is
 * mocked; DB is mocked for the derived-memory record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: Array<Record<string, unknown>> = [];
let llmResponse: { narrative: string; themes: string[] };

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve(undefined);
      },
    }),
  },
  memories: {},
  isSqlite: true,
}));

vi.mock('../src/services/llm.js', () => ({
  callLLMStructured: (_sys: string, _content: string) => Promise.resolve(llmResponse),
}));

vi.mock('../lib/logging.js', () => ({ log: { error: () => undefined, info: () => undefined } }));

import { stitchMemories, buildStitchPrompt, type Fragment } from '../src/services/memory-stitcher.js';

beforeEach(() => {
  inserted.length = 0;
  llmResponse = { narrative: 'The team shipped the feature.', themes: ['shipping', 'teamwork'] };
});

const frags: Fragment[] = [
  { id: 'a', content: 'We planned the feature.' },
  { id: 'b', content: 'We built the feature.' },
];

describe('buildStitchPrompt', () => {
  it('embeds each fragment into the prompt', () => {
    const p = buildStitchPrompt(frags);
    expect(p).toContain('We planned the feature.');
    expect(p).toContain('We built the feature.');
  });
  it('numbers the fragments', () => {
    const p = buildStitchPrompt(frags);
    expect(p).toContain('1.');
    expect(p).toContain('2.');
  });
});

describe('stitchMemories', () => {
  it('returns a narrative and themes from the LLM', async () => {
    const res = await stitchMemories(frags);
    expect(res.narrative).toBe('The team shipped the feature.');
    expect(res.themes).toEqual(['shipping', 'teamwork']);
  });

  it('persists a derived stitched memory', async () => {
    await stitchMemories(frags, { projectId: 'p1' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].projectId).toBe('p1');
    expect(inserted[0].kind).toBe('stitched');
  });

  it('handles an empty fragment list gracefully', async () => {
    const res = await stitchMemories([]);
    expect(res.narrative).toBeDefined();
  });

  it('links the source fragment ids', async () => {
    await stitchMemories(frags);
    expect(inserted[0].sourceMemoryIds).toEqual(['a', 'b']);
  });
});

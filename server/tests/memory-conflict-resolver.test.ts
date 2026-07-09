import { describe, it, expect } from 'vitest';
import {
  selectWinner,
  type ConflictStrategy,
  type MemoryLite,
} from '../src/services/memory-conflict-resolver.js';

const m = (over: Partial<MemoryLite>): MemoryLite => ({
  id: 'x',
  createdAt: new Date(0),
  importance: 0,
  title: 't',
  content: 'c',
  tags: [],
  projectId: null,
  ...over,
});

describe('memory-conflict-resolver / selectWinner', () => {
  it('newest_wins picks the later createdAt', () => {
    const a = m({ id: 'a', createdAt: new Date(1000) });
    const b = m({ id: 'b', createdAt: new Date(2000) });
    expect(selectWinner('newest_wins', a, b)).toBe('b');
    expect(selectWinner('newest_wins', b, a)).toBe('b');
  });

  it('newest_wins prefers a on ties', () => {
    const a = m({ id: 'a', createdAt: new Date(0) });
    const b = m({ id: 'b', createdAt: new Date(0) });
    expect(selectWinner('newest_wins', a, b)).toBe('a');
  });

  it('highest_importance picks the larger importance', () => {
    const a = m({ id: 'a', importance: 0.3 });
    const b = m({ id: 'b', importance: 0.8 });
    expect(selectWinner('highest_importance', a, b)).toBe('b');
  });

  it('highest_importance prefers a on ties', () => {
    const a = m({ id: 'a', importance: 0.5 });
    const b = m({ id: 'b', importance: 0.5 });
    expect(selectWinner('highest_importance', a, b)).toBe('a');
  });

  it('returns empty for non-deterministic strategies (llm_merge, prompt_user)', () => {
    const a = m({ id: 'a' });
    const b = m({ id: 'b' });
    expect(selectWinner('llm_merge' as ConflictStrategy, a, b)).toBe('');
    expect(selectWinner('prompt_user' as ConflictStrategy, a, b)).toBe('');
  });
});

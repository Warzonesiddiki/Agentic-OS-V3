import { describe, it, expect } from 'vitest';
import {
  mergeConcat,
  mergeFirstWins,
  mergeMajority,
  mergeSchemaUnion,
  mergeBy,
  type MergeInput,
} from '../src/services/merge-strategies.js';

describe('merge-strategies', () => {
  it('concat arrays', () => {
    const items: MergeInput[] = [
      { stepId: 'a', value: [1, 2] },
      { stepId: 'b', value: [3] },
    ];
    expect(mergeConcat(items)).toEqual([1, 2, 3]);
  });

  it('concat strings with newline', () => {
    expect(
      mergeConcat([
        { stepId: 'a', value: 'x' },
        { stepId: 'b', value: 'y' },
      ])
    ).toBe('x\ny');
  });

  it('first-wins returns first defined', () => {
    expect(
      mergeFirstWins([
        { stepId: 'a', value: undefined },
        { stepId: 'b', value: 'ok' },
      ])
    ).toBe('ok');
  });

  it('majority picks most frequent', () => {
    const items: MergeInput[] = [
      { stepId: 'a', value: 'A' },
      { stepId: 'b', value: 'A' },
      { stepId: 'c', value: 'B' },
    ];
    expect(mergeMajority(items)).toBe('A');
  });

  it('schema-union merges objects and unions arrays', () => {
    const items: MergeInput[] = [
      { stepId: 'a', value: { x: 1, list: [1] } },
      { stepId: 'b', value: { y: 2, list: [2] } },
    ];
    expect(mergeSchemaUnion(items)).toEqual({ x: 1, y: 2, list: [1, 2] });
  });

  it('mergeBy dispatches by name', () => {
    const items: MergeInput[] = [
      { stepId: 'a', value: 'A' },
      { stepId: 'b', value: 'A' },
      { stepId: 'c', value: 'B' },
    ];
    expect(mergeBy('majority', items)).toBe('A');
    expect(mergeBy('first-wins', items)).toBe('A');
  });

  it('llm-merge throws from sync dispatch', () => {
    expect(() => mergeBy('llm-merge', [{ stepId: 'a', value: 1 }])).toThrow();
  });
});

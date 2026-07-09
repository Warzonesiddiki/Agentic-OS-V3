import { describe, it, expect } from 'vitest';
import { compileWorkflow } from '../src/services/workflow-dsl.js';

const goodDsl = {
  version: 1 as const,
  name: 'research',
  env: { model: 'mini-max-m3' },
  merge: 'concat' as const,
  steps: [
    { id: 'plan', do: 'planner.skill', inputs: { topic: 'x' } },
    { id: 'draft', do: 'writer.skill', depends: ['plan'], inputs: { brief: '{{plan.output}}' } },
    {
      id: 'review',
      do: 'critic.skill',
      depends: ['draft'],
      gate: 'hitl' as const,
      onError: 'retry' as const,
    },
  ],
};

describe('workflow-dsl', () => {
  it('compiles and topologically orders', () => {
    const wf = compileWorkflow(goodDsl);
    expect(wf.order).toEqual(['plan', 'draft', 'review']);
    expect(wf.steps).toHaveLength(3);
    expect(wf.defaultMerge).toBe('concat');
  });

  it('rejects dangling dependency', () => {
    expect(() =>
      compileWorkflow({ ...goodDsl, steps: [{ id: 'a', do: 'x', depends: ['ghost'] }] })
    ).toThrow(/unknown step/);
  });

  it('rejects cycles', () => {
    expect(() =>
      compileWorkflow({
        version: 1,
        name: 'cyc',
        steps: [
          { id: 'a', do: 'x', depends: ['b'] },
          { id: 'b', do: 'y', depends: ['a'] },
        ],
      })
    ).toThrow(/cycle/);
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() => compileWorkflow({ ...goodDsl, surprise: true } as never)).toThrow();
  });
});

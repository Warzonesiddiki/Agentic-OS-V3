import { describe, it, expect } from 'vitest';
import { DedupEngine, MemoryDedupStore, taskKey } from '../src/services/dedup-engine.js';

describe('dedup-engine', () => {
  it('produces stable key across input ordering', () => {
    const a = taskKey('wf', 's1', { x: 1, y: 2 });
    const b = taskKey('wf', 's1', { y: 2, x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^dk:wf:s1:/);
  });

  it('replay returns cached output when done', async () => {
    const e = new DedupEngine(new MemoryDedupStore());
    const k = taskKey('wf', 's2', { q: 'hi' });
    expect(await e.replay(k)).toBeUndefined();
    await e.record(k, { result: 42 });
    expect(await e.replay(k)).toEqual({ result: 42 });
    expect(await e.isDone(k)).toBe(true);
  });

  it('different inputs yield different keys', () => {
    expect(taskKey('wf', 's', { a: 1 })).not.toBe(taskKey('wf', 's', { a: 2 }));
  });
});

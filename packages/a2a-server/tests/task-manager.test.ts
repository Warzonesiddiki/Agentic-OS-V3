import { describe, it, expect, vi } from 'vitest';
import { TaskManager } from '../src/task-manager.js';

describe('TaskManager', () => {
  it('preserves insertion order in list()', () => {
    const tm = new TaskManager();
    tm.create('t1', 'a1');
    tm.create('t2', 'a2');
    expect(tm.list().map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('updates state and emits update events', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    const listener = vi.fn();
    tm.on('update', listener);
    tm.update(id, { state: 'completed' });
    expect(tm.get(id)?.state).toBe('completed');
    expect(listener).toHaveBeenCalled();
  });

  it('throws on update of unknown task', () => {
    const tm = new TaskManager();
    expect(() => tm.update('ghost', { state: 'completed' })).toThrow(/Unknown task/);
  });

  it('removes tasks', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    expect(tm.remove(id)).toBe(true);
    expect(tm.get(id)).toBeUndefined();
    expect(tm.remove(id)).toBe(false);
  });

  it('claims an unclaimed task', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    expect(tm.claim(id, 'worker1')).toBe(true);
    expect(tm.get(id)?.claimedBy).toBe('worker1');
  });

  it('does not double-claim a claimed task', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    tm.claim(id, 'worker1');
    expect(tm.claim(id, 'worker2')).toBe(false);
    expect(tm.get(id)?.claimedBy).toBe('worker1');
  });

  it('releases a claimed task back to unclaimed', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    tm.claim(id, 'worker1');
    tm.release(id, 'worker1');
    expect(tm.get(id)?.claimedBy).toBeUndefined();
    expect(tm.get(id)?.state).toBe('submitted');
  });

  it('only the claimer can release the task', () => {
    const tm = new TaskManager();
    const id = tm.create('t1', 'a1');
    tm.claim(id, 'worker1');
    tm.release(id, 'worker2');
    expect(tm.get(id)?.claimedBy).toBe('worker1');
  });

  it('lists only tasks claimed by a worker', () => {
    const tm = new TaskManager();
    const a = tm.create('t1', 'a1');
    const b = tm.create('t2', 'a2');
    tm.claim(a, 'worker1');
    tm.claim(b, 'worker2');
    expect(tm.listClaimedBy('worker1').map((t) => t.id)).toEqual([a]);
  });
});

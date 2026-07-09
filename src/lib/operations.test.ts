/**
 * Unit tests for the store reducers in src/lib/operations.ts.
 *
 * Covers the three things the perfection brief calls out:
 *   1. actions produce the expected next state,
 *   2. prior state is never mutated (immutability — verified with deep-freeze),
 *   3. async setters (syncToRemote) handle timeout / rejection without corrupting state.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as ops from './operations';
import { createDefaultState } from './engine';
import type { NexusState } from './types';

/** Recursively freeze an object so any accidental in-place mutation throws. */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
      deepFreeze(value);
    }
  }
  return obj;
}

function freshState(): NexusState {
  return createDefaultState();
}

describe('operations reducers — expected state', () => {
  let state: NexusState;
  beforeEach(() => {
    state = freshState();
  });

  it('addMemory appends a memory with generated id + timestamps', () => {
    const next = ops.addMemory(state, { content: 'hello', tags: ['a'] });
    expect(next.memories).toHaveLength(1);
    const m = next.memories[0]!;
    expect(m.id).toBeTruthy();
    expect(m.content).toBe('hello');
    expect(m.tags).toEqual(['a']);
    expect(m.createdAt).toBeTypeOf('number');
    expect(m.updatedAt).toBeTypeOf('number');
  });

  it('addMemory keeps input tags immutable (does not share the array reference)', () => {
    const tags = ['x'];
    const next = ops.addMemory(state, { content: 'hi', tags });
    tags.push('y'); // mutate caller's array after the fact
    expect(next.memories[0]!.tags).toEqual(['x']);
  });

  it('updateMemory merges a partial patch without touching other fields', () => {
    const added = ops.addMemory(state, { content: 'orig', tags: ['t'] });
    const id = added.memories[0]!.id;
    const updated = ops.updateMemory(added, id, { content: 'changed' });
    const m = updated.memories.find((x) => x.id === id)!;
    expect(m.content).toBe('changed');
    expect(m.tags).toEqual(['t']);
    expect(m.updatedAt).toBeGreaterThanOrEqual(m.createdAt);
  });

  it('updateMemory is a no-op (returns same ref) for an unknown id', () => {
    const id = 'does-not-exist';
    const updated = ops.updateMemory(state, id, { content: 'x' });
    expect(updated).toBe(state);
  });

  it('removeMemory deletes by id and shrinks the array', () => {
    const added = ops.addMemory(state, { content: 'a' });
    const id = added.memories[0]!.id;
    const removed = ops.removeMemory(added, id);
    expect(removed.memories).toHaveLength(0);
  });

  it('addSkill / removeSkill manipulate the skills array', () => {
    const withSkill = ops.addSkill(state, { name: 's1', description: 'd', code: 'x' });
    expect(withSkill.skills).toHaveLength(1);
    const id = withSkill.skills[0]!.id;
    const removed = ops.removeSkill(withSkill, id);
    expect(removed.skills).toHaveLength(0);
  });

  it('addAgent / updateAgent / removeAgent manage the agents array', () => {
    const a = ops.addAgent(state, { id: 'ag1', name: 'A', status: 'idle', tasks: [], config: {} });
    expect(a.agents).toHaveLength(1);
    const u = ops.updateAgent(a, 'ag1', { status: 'busy' });
    expect(u.agents[0]!.status).toBe('busy');
    const r = ops.removeAgent(u, 'ag1');
    expect(r.agents).toHaveLength(0);
  });

  it('addAudit prepends an audit entry', () => {
    const next = ops.addAudit(state, { action: 'test', actor: 'uid', meta: {} });
    expect(next.auditLog).toHaveLength(1);
    expect(next.auditLog[0]!.action).toBe('test');
  });

  it('appendFeedback appends a feedback record', () => {
    const next = ops.appendFeedback(state, { rating: 5, comment: 'good' });
    expect(next.feedback).toHaveLength(1);
    expect(next.feedback[0]!.rating).toBe(5);
  });

  it('setKillSwitch flips the kill-switch flag', () => {
    expect(state.killSwitch).toBe(false);
    const on = ops.setKillSwitch(state, true, 'perf test');
    expect(on.killSwitch).toBe(true);
    expect(on.killSwitchReason).toBe('perf test');
  });

  it('setRemoteMode updates remote mode + reason', () => {
    const next = ops.setRemoteMode(state, 'remote', 'test');
    expect(next.remoteMode).toBe('remote');
    expect(next.remoteReason).toBe('test');
  });
});

describe('operations reducers — immutability (no mutation of prior state)', () => {
  it('every reducer returns a NEW state object and leaves the input untouched', () => {
    const frozen = deepFreeze(freshState());
    const snapshot = JSON.parse(JSON.stringify(frozen)) as NexusState;

    // None of these should throw (deep-frozen input proves no in-place mutation).
    const afterAdd = ops.addMemory(frozen, { content: 'x' });
    const id = afterAdd.memories[0]!.id;
    const afterUpdate = ops.updateMemory(afterAdd, id, { content: 'y' });
    const afterRemove = ops.removeMemory(afterUpdate, id);
    const afterSkill = ops.addSkill(afterRemove, { name: 's', description: 'd', code: 'c' });
    const afterAgent = ops.addAgent(afterSkill, { id: 'a', name: 'A', status: 'idle', tasks: [], config: {} });
    const afterAudit = ops.addAudit(afterAgent, { action: 'z', actor: 'u', meta: {} });
    const afterFb = ops.appendFeedback(afterAudit, { rating: 1 });
    const afterKs = ops.setKillSwitch(afterFb, true, 'r');

    // Input reference is structurally identical to its captured snapshot.
    expect(frozen).toEqual(snapshot);
    // Output references are all distinct from the (untouched) input.
    expect(afterAdd).not.toBe(frozen);
    expect(afterUpdate).not.toBe(afterAdd);
    expect(afterRemove).not.toBe(afterUpdate);
    expect(afterKs).not.toBe(afterFb);
  });

  it('nested arrays are replaced, not mutated (prior snapshot arrays keep old length)', () => {
    const frozen = deepFreeze(freshState());
    const beforeMemories = frozen.memories;
    const next = ops.addMemory(frozen, { content: 'new' });
    expect(beforeMemories).toHaveLength(0); // original array untouched
    expect(next.memories).toHaveLength(1); // new array created
    expect(next.memories).not.toBe(beforeMemories);
  });
});

describe('operations async setter — syncToRemote timeout/retry resilience', () => {
  let state: NexusState;
  beforeEach(() => {
    state = ops.addMemory(freshState(), { content: 'payload' });
    vi.restoreAllMocks();
  });

  it('rejects on a network/timeout failure WITHOUT corrupting local state', async () => {
    const failingCall = vi.fn().mockRejectedValue(new Error('network down'));
    const v3 = await import('./remote');
    const spy = vi.spyOn(v3, 'call').mockImplementation(failingCall as never);
    try {
      await expect(ops.syncToRemote(state, { force: true })).rejects.toThrow(/network down/);
    } finally {
      spy.mockRestore();
    }
    // Local state is the same object — the failed remote push did not mutate it.
    expect(state.memories).toHaveLength(1);
  });

  it('returns the local state when remote is disabled (graceful no-op)', async () => {
    const disabled = ops.setRemoteMode(state, 'local', 'offline test');
    const result = await ops.syncToRemote(disabled, { force: true });
    expect(result).toBe(disabled);
  });
});

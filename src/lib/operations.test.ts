/**
 * Unit tests for the store reducers in src/lib/operations.ts.
 *
 * Covers the three things the perfection brief calls out:
 *   1. actions produce the expected next state (read via engine.getState, since
 *      these reducers commit to the canonical engine state),
 *   2. prior state is never mutated (commit replaces the state reference, so a
 *      captured snapshot reference stays untouched — verified with live refs),
 *   3. async setters (store.syncToRemote) handle timeout / rejection without
 *      corrupting state — see store.test.ts (that lives on the nexus facade).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as ops from './operations';
import { getState, wipeBrain } from './engine';

const ACTOR = 'unit-test';

describe('operations reducers — expected state', () => {
  beforeEach(() => wipeBrain());

  it('createMemory appends a memory with generated id + timestamps', () => {
    const m = ops.createMemory({ content: 'hello', tags: ['a'] }, ACTOR);
    expect(m.id).toBeTruthy();
    expect(m.content).toBe('hello');
    expect(m.tags).toEqual(['a']);
    expect(m.createdAt).toBeTypeOf('number');
    expect(getState().memories).toHaveLength(1);
  });

  it('createMemory keeps input tags immutable (does not share the array reference)', () => {
    const tags = ['x'];
    const m = ops.createMemory({ content: 'hi', tags }, ACTOR);
    tags.push('y'); // mutate caller's array after the fact
    expect(m.tags).toEqual(['x']);
  });

  it('updateMemory merges a partial patch without touching other fields', () => {
    const m = ops.createMemory({ content: 'orig', tags: ['t'] }, ACTOR);
    const updated = ops.updateMemory(m.id, { content: 'changed' }, ACTOR);
    expect(updated.content).toBe('changed');
    expect(updated.tags).toEqual(['t']);
  });

  it('updateMemory returns the same id for an unknown id (no throw)', () => {
    const updated = ops.updateMemory('nope', { content: 'x' }, ACTOR);
    expect(updated.id).toBe('nope');
  });

  it('deleteMemory removes by id', () => {
    const m = ops.createMemory({ content: 'a' }, ACTOR);
    ops.deleteMemory(m.id, ACTOR);
    expect(getState().memories).toHaveLength(0);
  });

  it('createSkill / deleteSkill manage the skills array', () => {
    const s = ops.createSkill({ name: 's1', description: 'd', code: 'x' }, ACTOR);
    expect(getState().skills).toHaveLength(1);
    ops.deleteSkill(s.id, ACTOR);
    expect(getState().skills).toHaveLength(0);
  });

  it('tripKillSwitch flips the kill-switch flag + reason', () => {
    const r = ops.tripKillSwitch(true, 'perf test', ACTOR);
    expect(r.killSwitch).toBe(true);
    expect(getState().meta.killSwitch).toBe('1');
    expect(getState().meta.killSwitchReason).toBe('perf test');
  });

  it('recordFeedback appends a feedback record', () => {
    ops.recordFeedback('q', 'm1', 'memory', true, ACTOR);
    expect(getState().feedback).toHaveLength(1);
    expect(getState().feedback[0]!.helpful).toBe(true);
  });
});

describe('operations reducers — immutability of prior state', () => {
  beforeEach(() => wipeBrain());

  it('a captured state reference is not mutated by later actions (commit replaces the ref)', () => {
    const created = ops.createMemory({ content: 'v1' }, ACTOR);
    const beforeRef = getState(); // live reference at this instant
    const beforeLen = beforeRef.memories.length; // 1

    ops.createMemory({ content: 'v2' }, ACTOR);
    const updated = ops.updateMemory(created.id, { content: 'mutated?' }, ACTOR);
    expect(updated.content).toBe('mutated?'); // the NEW state changed...

    // ...but the OLD reference (and its nested array) is unchanged.
    expect(beforeRef.memories).toHaveLength(beforeLen);
    expect(beforeRef.memories[0]!.content).toBe('v1');
    // A new commit produced a brand-new top-level state object.
    expect(beforeRef).not.toBe(getState());
  });

  it('nested arrays are replaced, not mutated (prior snapshot array keeps old length)', () => {
    ops.createMemory({ content: 'only' }, ACTOR);
    const beforeMemories = getState().memories;
    const lenBefore = beforeMemories.length;
    ops.createMemory({ content: 'more' }, ACTOR);
    expect(beforeMemories).toHaveLength(lenBefore); // original array untouched
    expect(getState().memories).toHaveLength(lenBefore + 1);
    expect(getState().memories).not.toBe(beforeMemories);
  });

  it('deleteMemory does not mutate the remaining array of an earlier snapshot', () => {
    const a = ops.createMemory({ content: 'a' }, ACTOR);
    const b = ops.createMemory({ content: 'b' }, ACTOR);
    const beforeRef = getState();
    ops.deleteMemory(a.id, ACTOR);
    expect(beforeRef.memories).toHaveLength(2);
    expect(getState().memories).toHaveLength(1);
    expect(getState().memories[0]!.id).toBe(b.id);
  });
});

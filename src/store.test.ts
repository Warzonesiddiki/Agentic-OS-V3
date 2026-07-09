/**
 * Unit tests for the public store facade in src/store.ts.
 *
 * Verifies the same three guarantees as the reducer tests but through the
 * *store* API the UI actually calls: actions mutate committed state as
 * expected, prior snapshots are never mutated, and async sync handles failure
 * gracefully (state stays intact, error is returned not thrown into the UI).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from './store';

function snapshot(state: ReturnType<typeof store.getState>) {
  return JSON.parse(JSON.stringify(state));
}

describe('store facade — expected state transitions', () => {
  beforeEach(() => {
    store.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addMemory / updateMemory / removeMemory round-trip correctly', () => {
    store.addMemory({ content: 'first', tags: ['t1'] });
    const id = store.getState().memories[0]!.id;
    expect(store.getState().memories).toHaveLength(1);

    store.updateMemory(id, { content: 'edited' });
    expect(store.getState().memories[0]!.content).toBe('edited');

    store.removeMemory(id);
    expect(store.getState().memories).toHaveLength(0);
  });

  it('addSkill / removeSkill', () => {
    store.addSkill({ name: 'sk', description: 'd', code: 'c' });
    const id = store.getState().skills[0]!.id;
    expect(store.getState().skills).toHaveLength(1);
    store.removeSkill(id);
    expect(store.getState().skills).toHaveLength(0);
  });

  it('addAgent / updateAgent / removeAgent', () => {
    store.addAgent({ id: 'a1', name: 'A', status: 'idle', tasks: [], config: {} });
    expect(store.getState().agents).toHaveLength(1);
    store.updateAgent('a1', { status: 'running' });
    expect(store.getState().agents[0]!.status).toBe('running');
    store.removeAgent('a1');
    expect(store.getState().agents).toHaveLength(0);
  });

  it('setKillSwitch updates flag + reason', () => {
    store.setKillSwitch(true, 'stress test');
    expect(store.getState().killSwitch).toBe(true);
    expect(store.getState().killSwitchReason).toBe('stress test');
  });

  it('appendFeedback + addAudit accumulate', () => {
    store.appendFeedback({ rating: 4, comment: 'ok' });
    store.addAudit({ action: 'do', actor: 'uid', meta: {} });
    expect(store.getState().feedback).toHaveLength(1);
    expect(store.getState().auditLog).toHaveLength(1);
  });
});

describe('store facade — immutability of prior snapshots', () => {
  beforeEach(() => store.reset());

  it('a captured snapshot is not mutated by later actions', () => {
    store.addMemory({ content: 'v1' });
    const before = snapshot(store.getState());
    const beforeRef = store.getState();

    store.addMemory({ content: 'v2' });
    store.updateMemory(beforeRef.memories[0]!.id, { content: 'mutated?' });

    // The OLD snapshot reference + its serialized copy are unchanged.
    expect(before.memories).toHaveLength(1);
    expect(before.memories[0]!.content).toBe('v1');
    expect(beforeRef.memories).toHaveLength(1);
    expect(beforeRef).not.toBe(store.getState());
  });
});

describe('store facade — async syncToRemote resilience (timeout/retry)', () => {
  beforeEach(() => store.reset());
  afterEach(() => vi.restoreAllMocks());

  it('surfaces remote failure as an error result and leaves local state intact', async () => {
    store.addMemory({ content: 'local-only' });
    const localLen = store.getState().memories.length;

    const v3 = await import('./remote');
    const spy = vi.spyOn(v3, 'call').mockRejectedValue(new Error('ETIMEDOUT'));
    try {
      const res = await store.syncToRemote({ force: true });
      expect(res.ok).toBe(false);
      expect(res.error?.message).toMatch(/ETIMEDOUT/);
    } finally {
      spy.mockRestore();
    }
    // Local state unaffected by the failed push.
    expect(store.getState().memories).toHaveLength(localLen);
  });

  it('does not throw when remote is disabled (local-only no-op returns ok)', async () => {
    store.reset();
    store.setRemoteMode('local', 'offline');
    const res = await store.syncToRemote({ force: true });
    expect(res.ok).toBe(true);
  });
});

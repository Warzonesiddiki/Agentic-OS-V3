/**
 * Unit tests for the public store facade in src/store.ts (exported as `nexus`).
 *
 * Verifies the same three guarantees as the reducer tests but through the
 * *facade* the UI actually calls: actions mutate committed state as expected,
 * prior snapshots are never mutated, and async sync handles failure gracefully
 * (state stays intact, error is returned not thrown into the UI).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nexus, syncToRemote, getState } from './store';
import { setRemote, remoteEnabled } from './lib/remote';

function snapshot(state: ReturnType<typeof getState>) {
  return JSON.parse(JSON.stringify(state));
}

describe('nexus facade — expected state transitions', () => {
  beforeEach(() => {
    nexus.wipe(); // truly clear (resetBrain rehydrates from persisted state)
  });
  afterEach(() => vi.restoreAllMocks());

  it('createMemory / updateMemory / deleteMemory round-trip correctly', () => {
    const created = nexus.createMemory({ content: 'first', tags: ['t1'] });
    const id = created.id;
    expect(getState().memories).toHaveLength(1);
    expect(getState().memories[0]!.content).toBe('first');

    nexus.updateMemory(id, { content: 'edited' });
    expect(getState().memories[0]!.content).toBe('edited');

    nexus.deleteMemory(id);
    expect(getState().memories).toHaveLength(0);
  });

  it('createSkill / deleteSkill', () => {
    const created = nexus.createSkill({ name: 'sk', description: 'd', code: 'c' });
    expect(getState().skills).toHaveLength(1);
    nexus.deleteSkill(created.id);
    expect(getState().skills).toHaveLength(0);
  });

  it('killSwitch flips the meta flag + records the reason', () => {
    nexus.killSwitch(true, 'stress test');
    expect(getState().meta.killSwitch).toBe('1');
    expect(getState().meta.killSwitchReason).toBe('stress test');
  });

  it('feedback accumulates records', () => {
    nexus.feedback({ query: 'q', itemId: 'm1', itemType: 'memory', helpful: true });
    expect(getState().feedback.length).toBeGreaterThan(0);
  });

  it('capture / checkpoint / transfer move memory between stores', () => {
    const m = nexus.createMemory({ content: 'a' });
    nexus.capture(m.id, 'archive');
    expect(getState().archived.length).toBe(1);
    nexus.checkpoint('cp1');
    expect(getState().checkpoints.length).toBe(1);
    nexus.transfer(m.id, 'shared');
    expect(getState().shared.length).toBe(1);
  });
});

describe('nexus facade — immutability of prior snapshots', () => {
  beforeEach(() => nexus.wipe());

  it('a captured snapshot is not mutated by later actions', () => {
    const created = nexus.createMemory({ content: 'v1' });
    const before = snapshot(getState());
    const beforeRef = getState();

    nexus.createMemory({ content: 'v2' });
    nexus.updateMemory(created.id, { content: 'mutated?' });

    // The OLD snapshot reference + its serialized copy are unchanged.
    expect(before.memories).toHaveLength(1);
    expect(before.memories[0]!.content).toBe('v1');
    expect(beforeRef.memories).toHaveLength(1);
    expect(beforeRef).not.toBe(getState());
  });
});

describe('nexus facade — async syncToRemote resilience (timeout/retry)', () => {
  beforeEach(() => {
    nexus.wipe();
    // Enable the remote path (route() requires remoteEnabled() => enabled && baseUrl).
    setRemote({ enabled: true, baseUrl: 'http://localhost:9900', mode: 'remote', apiKey: 'k' });
    expect(remoteEnabled()).toBe(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setRemote({ enabled: false, baseUrl: '', mode: 'local' });
  });

  it('surfaces remote failure as an error result and leaves local state intact', async () => {
    nexus.createMemory({ content: 'local-only' });
    const localLen = getState().memories.length;

    const v3 = await import('./remote');
    const spy = vi.spyOn(v3, 'call').mockRejectedValue(new Error('ETIMEDOUT'));
    try {
      const res = await syncToRemote({ force: true });
      expect(res.ok).toBe(false);
      expect(res.error?.message).toMatch(/ETIMEDOUT/);
    } finally {
      spy.mockRestore();
    }
    // Local state unaffected by the failed push.
    expect(getState().memories).toHaveLength(localLen);
  });

  it('does not throw when pushed locally (remote disabled no-op returns ok)', async () => {
    setRemote({ enabled: false, baseUrl: '', mode: 'local' });
    nexus.createMemory({ content: 'x' });
    const res = await syncToRemote({ force: true });
    expect(res.ok).toBe(true);
  });
});

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setKernelStatePath,
  persistKernelState,
  loadKernelState,
  defaultKernelState,
  startPersistenceTicker,
  __resetPersistence,
  type KernelPersistedState,
} from '../src/services/kernel-persistence.js';

describe('kernel persistence', () => {
  let dir = '';
  beforeEach(() => {
    __resetPersistence();
  });
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  it('round-trips state to a JSON file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kernel-state-'));
    const path = join(dir, 'state.json');
    setKernelStatePath(path);
    const state: KernelPersistedState = {
      ...defaultKernelState(),
      rings: { '0': { concurrency: 2 } },
      agents: { a1: { status: 'running' } },
      tasks: { t1: { status: 'queued' } },
      metrics: { running: 4 },
      mode: 'preemptive',
      panic: null,
    };
    await persistKernelState(state);
    const loaded = await loadKernelState();
    expect(loaded.version).toBe(1);
    expect(loaded.rings).toEqual(state.rings);
    expect(loaded.agents).toEqual(state.agents);
    expect(loaded.tasks).toEqual(state.tasks);
    expect(loaded.metrics).toEqual(state.metrics);
    expect(loaded.mode).toBe('preemptive');
  });

  it('falls back to defaults when no file exists', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kernel-state-'));
    setKernelStatePath(join(dir, 'missing.json'));
    const loaded = await loadKernelState();
    expect(loaded.version).toBe(1);
    expect(loaded.rings).toEqual({});
    expect(loaded.agents).toEqual({});
  });

  it('startPersistenceTicker persists periodically and stops', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kernel-state-'));
    const path = join(dir, 'tick.json');
    setKernelStatePath(path);
    let calls = 0;
    const stop = startPersistenceTicker(() => {
      calls += 1;
      return defaultKernelState();
    }, 10);
    await new Promise((r) => setTimeout(r, 35));
    stop();
    expect(calls).toBeGreaterThanOrEqual(2);
    const loaded = await loadKernelState();
    expect(loaded.version).toBe(1);
  });
});

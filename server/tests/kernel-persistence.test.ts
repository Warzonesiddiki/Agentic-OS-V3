import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
    // Stop any live ticker BEFORE removing the temp dir: a tick that fired
    // after cleanup used to race `rm` and log kernel_state_save_failed
    // ENOENT against the already-deleted tick.json path.
    __resetPersistence();
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
    // Fake timers make the ticker deterministic under parallel full-suite
    // load: exactly one tick per 10 ms of advanced virtual time. Real-timer
    // scheduling previously starved the fixed 35 ms sleep below the >= 2
    // threshold when the event loop stalled (libuv coalesces missed
    // interval periods), and a test-timeout teardown could rm the temp dir
    // while the real interval was still live (ENOENT on tick.json).
    vi.useFakeTimers();
    try {
      const ticker = startPersistenceTicker(() => {
        calls += 1;
        return defaultKernelState();
      }, 10);
      await vi.advanceTimersByTimeAsync(35);
      expect(calls).toBeGreaterThanOrEqual(2);
      const callsAtStop = calls;
      // `startPersistenceTicker` returns a CALLABLE manual-flush handle
      // ({ (): void; stop(): void }) — invoking it fires exactly one extra
      // tick. Only `.stop()` clears the underlying interval; calling the
      // handle itself (the old test did) never stopped the ticker, leaving a
      // live interval writing into the removed temp dir (ENOENT tick.json).
      ticker.stop();
      await vi.advanceTimersByTimeAsync(60);
      expect(calls).toBe(callsAtStop);
      const loaded = await loadKernelState();
      expect(loaded.version).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

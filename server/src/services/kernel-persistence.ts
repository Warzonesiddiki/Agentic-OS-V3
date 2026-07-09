import * as fs from 'node:fs';
import { log } from '../lib/logging.js';

/**
 * Phase 11 — Task 11.35: State Persistence Across Restarts.
 *
 * The kernel serialises a snapshot of its runtime state (rings, agents, tasks,
 * counters, watchdogs, panic state) so it can be restored on restart. Persistence
 * is file-backed when a path is configured; otherwise an in-memory store is used.
 *
 * Two layers are provided:
 *  - `serializeKernelState` / `deserializeKernelState` — pure (de)serialisation.
 *  - `persistKernelState` / `loadKernelState` / `startPersistenceTicker` — the
 *    live store with optional JSON-file backing + periodic flush.
 */

export interface KernelPersistedState {
  version: number;
  savedAt: number;
  rings: Record<string, unknown>;
  agents: Record<string, unknown>;
  tasks: Record<string, unknown>;
  metrics: Record<string, unknown>;
  watchdogs: Record<string, unknown>;
  mode: 'cooperative' | 'preemptive';
  panic?: { reason: string; extra?: Record<string, unknown>; at: number } | null;
}

export function defaultKernelState(): KernelPersistedState {
  return {
    version: 1,
    savedAt: 0,
    rings: {},
    agents: {},
    tasks: {},
    metrics: {},
    watchdogs: {},
    mode: 'cooperative',
    panic: null,
  };
}

const SCHEMA_VERSION = 1;

export function serializeKernelState(state: KernelPersistedState): string {
  if (typeof state !== 'object' || state === null) {
    throw new Error('serializeKernelState: state must be an object');
  }
  return JSON.stringify(state);
}

export function deserializeKernelState(raw: string): KernelPersistedState {
  if (typeof raw !== 'string') throw new Error('deserializeKernelState: input must be a string');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `deserializeKernelState: invalid JSON (${e instanceof Error ? e.message : String(e)})`
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('deserializeKernelState: payload is not an object');
  }
  const obj = parsed as Partial<KernelPersistedState>;
  const out = defaultKernelState();
  return {
    ...out,
    ...obj,
    version: SCHEMA_VERSION,
  } as KernelPersistedState;
}

// ── Live store ───────────────────────────────────────────────────────────────

let storePath: string | null = null;
let memory: KernelPersistedState = defaultKernelState();
let ticker: { stop: () => void } | null = null;

export function setKernelStatePath(path: string | null): void {
  storePath = path;
  if (path) {
    // Attempt to hydrate from disk if present.
    const loaded = loadFromFile();
    if (loaded) memory = loaded;
  }
}

function loadFromFile(): KernelPersistedState | null {
  if (!storePath) return null;
  try {
    if (!fs.existsSync(storePath)) return null;
    return deserializeKernelState(fs.readFileSync(storePath, 'utf8'));
  } catch (e) {
    log.warn('kernel_state_load_failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function saveToFile(state: KernelPersistedState): void {
  if (!storePath) return;
  try {
    fs.writeFileSync(storePath, serializeKernelState(state), 'utf8');
  } catch (e) {
    log.error('kernel_state_save_failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

export function persistKernelState(state: KernelPersistedState): void {
  memory = { ...state, version: SCHEMA_VERSION, savedAt: Date.now() };
  saveToFile(memory);
}

export function loadKernelState(): KernelPersistedState {
  return memory;
}

export type PersistenceTicker = {
  (): void;
  stop(): void;
};

/**
 * Periodically flush a snapshot provider to the store. Returns a stop handle.
 * `provider` is invoked each tick to obtain the latest kernel snapshot.
 */
export function startPersistenceTicker(
  provider: () => KernelPersistedState,
  intervalMs = 5000
): PersistenceTicker {
  if (ticker) ticker.stop();
  const impl = () => {
    try {
      persistKernelState(provider());
    } catch (e) {
      log.error('persistence_tick_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  };
  const handle = setInterval(impl, intervalMs);
  const api = impl as PersistenceTicker;
  api.stop = () => {
    clearInterval(handle);
    ticker = null;
  };
  ticker = api;
  return api;
}

/** Test helper — reset the in-memory store. */
export function __resetPersistence(): void {
  memory = defaultKernelState();
  storePath = null;
  if (ticker) {
    ticker.stop();
    ticker = null;
  }
}

/**
 * dedup-engine.ts — Phase 13.19 output dedup / idempotency (PURE core).
 *
 * Computes a deterministic idempotency key from (workflowId, stepId, inputs)
 * and tracks completed results so a replay with the same key returns the cached
 * output instead of re-executing. The store is injected (in-memory default; the
 * orchestrator core swaps in a Drizzle-backed store later) — no DB import here.
 */
import { createHash } from 'node:crypto';
import { log } from '../lib/logging.js';

export interface DedupStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  has(key: string): Promise<boolean>;
}

/** Simple in-memory store (safe default; swap for DB-backed in core). */
export class MemoryDedupStore implements DedupStore {
  private m = new Map<string, unknown>();
  async get(key: string): Promise<unknown | undefined> {
    return this.m.get(key);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.m.set(key, value);
  }
  async has(key: string): Promise<boolean> {
    return this.m.has(key);
  }
}

/** Deterministic key: hash of normalized inputs. Stable across replays/resumes. */
export function taskKey(workflowId: string, stepId: string, inputs: unknown): string {
  const norm = stableStringify(inputs);
  const h = createHash('sha256')
    .update(`${workflowId}|${stepId}|${norm}`)
    .digest('hex')
    .slice(0, 32);
  return `dk:${workflowId}:${stepId}:${h}`;
}

export class DedupEngine {
  constructor(private store: DedupStore = new MemoryDedupStore()) {}

  /** True if this task already completed (idempotent replay should skip exec). */
  async isDone(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /** Record a completed result. */
  async record(key: string, output: unknown): Promise<void> {
    await this.store.set(key, output);
    log.debug('dedup.record', { key });
  }

  /** Return cached output if done, else undefined. */
  async replay(key: string): Promise<unknown | undefined> {
    if (await this.isDone(key)) {
      log.debug('dedup.replay', { key, hit: true });
      return this.store.get(key);
    }
    return undefined;
  }
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object'
      ? Object.keys(val)
          .sort()
          .reduce(
            (o, k) => ((o[k] = (val as Record<string, unknown>)[k]), o),
            {} as Record<string, unknown>
          )
      : val
  );
}

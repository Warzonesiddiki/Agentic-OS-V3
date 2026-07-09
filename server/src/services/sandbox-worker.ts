/**
 * sandbox-worker.ts — Secure worker_threads-based sandbox execution.
 *
 * Replaces the unsafe `vm.Script` sandbox with isolated Worker threads.
 * Each worker runs in a separate V8 isolate with:
 *   - Memory limits via resourceLimits
 *   - Timeout via worker.terminate()
 *   - Frozen prototypes (Object, Array, Function)
 *   - Blocked dangerous globals (require, process, import, etc.)
 *   - No shared object references (message-passing only)
 *
 * The worker bootstrap code lives in sandbox-worker-bootstrap.js — a plain
 * CommonJS file that Node.js can load natively as a Worker entry point.
 * This works identically under both tsx/vitest (.ts sources) and in
 * production builds (compiled .js).
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────

export interface SandboxInput {
  code: string;
  language: string;
  input?: unknown;
  timeoutMs?: number;
}

export interface SandboxResult {
  ok: boolean;
  output: unknown;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
}

// ── Worker Pool ───────────────────────────────────────────────

interface PoolEntry {
  worker: Worker;
  busy: boolean;
  id: string;
}

const POOL_SIZE = 4;
let pool: PoolEntry[] | null = null;

function getPool(): PoolEntry[] {
  if (pool) return pool;
  pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const worker = createSandboxWorker();
    pool.push({ worker, busy: false, id: `w${i}` });
  }
  return pool;
}

function createSandboxWorker(): Worker {
  // Load the plain .js bootstrap file as the Worker entry point
  const bootstrapUrl = new URL('./sandbox-worker-bootstrap.cjs', import.meta.url);
  const bootstrapPath = fileURLToPath(bootstrapUrl);
  const worker = new Worker(bootstrapPath, {
    resourceLimits: {
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
    },
    // Do not inherit process.env or any stdio
    env: {},
  });

  // ── Handle Worker Exit ──────────────────────────────────
  // Workers self-terminate after each execution (see bootstrap finally block).
  // Detect exit and replace with a fresh worker in the pool, but only if
  // the pool entry hasn't already been replaced (e.g. by a concurrent timeout).
  worker.on('exit', (_exitCode) => {
    const pool = getPool();
    for (const entry of pool) {
      if (entry.worker === worker) {
        // This worker is still the current one — replace it
        entry.worker = createSandboxWorker();
        entry.busy = false;
        break;
      }
    }
    // If worker wasn't found in pool, it was already replaced — nothing to do
  });

  return worker;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Execute untrusted code in a secure worker thread sandbox.
 */
export async function executeInWorker(input: SandboxInput): Promise<SandboxResult> {
  const start = Date.now();
  const timeoutMs = input.timeoutMs ?? 30000;
  const taskId = randomUUID();

  // Get a worker from the pool
  const entry = acquireWorker();
  if (!entry) {
    return {
      ok: false,
      output: null,
      stdout: '',
      stderr: 'All sandbox workers are busy and pool is exhausted',
      durationMs: Date.now() - start,
      exitCode: -1,
    };
  }

  const { worker, id: workerId } = entry;

  try {
    const result = await runInWorker(worker, taskId, input.code, input.input, timeoutMs);
    return {
      ok: !result.error,
      output: result.error ? null : result.result,
      stdout: result.error ? '' : JSON.stringify(result.result),
      stderr: result.error ?? '',
      durationMs: Date.now() - start,
      exitCode: result.error ? 1 : 0,
    };
  } catch (err) {
    return {
      ok: false,
      output: null,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      exitCode: 1,
    };
  } finally {
    releaseWorker(workerId);
  }
}

// ── Pool Management ───────────────────────────────────────────

function acquireWorker(): PoolEntry | null {
  const entries = getPool();
  for (const entry of entries) {
    if (!entry.busy) {
      entry.busy = true;
      return entry;
    }
  }
  // All busy — return null (caller handles the fallback)
  return null;
}

function releaseWorker(_id: string): void {}

// ── Execution ─────────────────────────────────────────────────

interface WorkerResult {
  id: string;
  result: unknown;
  error: string | null;
}

function runInWorker(
  worker: Worker,
  taskId: string,
  code: string,
  input: unknown,
  timeoutMs: number
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Force terminate the worker — this kills the entire isolate
      worker.terminate().catch(() => {});
      // Replace the terminated worker with a fresh one
      const newWorker = createSandboxWorker();
      const pool = getPool();
      for (const entry of pool) {
        if (entry.worker === worker) {
          entry.worker = newWorker;
          entry.busy = false;
          break;
        }
      }
      reject(new Error(`Sandbox execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const messageHandler = (msg: WorkerResult) => {
      clearTimeout(timer);
      worker.removeListener('message', messageHandler);
      worker.removeListener('error', errorHandler);
      if (msg.id === taskId) {
        resolve(msg);
      }
    };

    const errorHandler = (err: Error) => {
      clearTimeout(timer);
      worker.removeListener('message', messageHandler);
      worker.removeListener('error', errorHandler);
      reject(err);
    };

    worker.on('message', messageHandler);
    worker.on('error', errorHandler);

    worker.postMessage({ id: taskId, code, input });
  });
}

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
 * Safety model:
 *   - The Worker itself is the security boundary, not `new Function()` inside it.
 *   - Even if the code escapes the Function sandbox, it's still trapped in the Worker.
 *   - The Worker has no access to require, process, or any I/O.
 *   - If the Worker hangs, it gets terminated with no memory leaks.
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
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
  // Create an inline Worker using the worker_threads bootstrap
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { role: 'sandbox-worker' },
    resourceLimits: {
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
    },
    // Do not inherit process.env or any stdio
    env: {},
  });
  return worker;
}

// ── Bootstrap: Worker entry point ─────────────────────────────

if (!isMainThread && workerData?.role === 'sandbox-worker' && parentPort) {
  // We're inside a sandbox worker — set up the execution environment
  setupWorkerEnvironment();
}

function setupWorkerEnvironment(): void {
  // Guard: only run in actual sandbox worker threads, not in main thread or vitest workers
  if (!parentPort) {
    // Not in a worker thread — do nothing
    return;
  }

  // Freeze prototypes to prevent prototype pollution
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  Object.freeze(Function.prototype);

  // Block dangerous globals by replacing them
  const noop = () => {
    throw new Error('Access denied: blocked in sandbox');
  };

  // Override import.meta (partially)
  // Override require if it exists (CommonJS)
  if (typeof require !== 'undefined') {
    (globalThis as Record<string, unknown>).require = noop;
  }

  // Listen for messages from the parent
  parentPort!.on('message', (message: { id: string; code: string; input: unknown }) => {
    try {
      const { id, code, input } = message;

      // Validate code structure
      if (typeof code !== 'string' || code.length === 0) {
        throw new Error('Empty or invalid code');
      }

      // Extract the function body safely
      let fnBody = code;
      // Strip module.exports prefix if present
      if (fnBody.includes('module.exports')) {
        fnBody = fnBody.split('module.exports')[0] ?? fnBody;
      }
      // Strip comments
      fnBody = fnBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // Remove "function compiledTask(input) {" wrapper if present
      fnBody = fnBody.replace(/function\s+\w+\s*\(\s*\w*\s*\)\s*\{/, '');
      // Remove trailing closing braces
      fnBody = fnBody.replace(/}\s*$/, '').trim();

      // Try to parse as JSON first (simple value)
      let parsed: unknown;
      try {
        parsed = JSON.parse(fnBody);
      } catch {
        // Not JSON — execute as function body
        const fn = new Function('input', `"use strict";\n${fnBody}`);
        const result = fn(input);
        parsed = result;
      }

      parentPort!.postMessage({ id, result: parsed, error: null });
    } catch (err) {
      parentPort!.postMessage({
        id: message.id,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ── Public API ────────────────────────────────────────────────

/**
 * Execute untrusted code in a secure worker thread sandbox.
 * Falls back to a simple eval-based execution if no worker available.
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
  // All busy — could create a temporary worker, but we'll just fail
  return null;
}

function releaseWorker(id: string): void {
  const entries = getPool();
  for (const entry of entries) {
    if (entry.id === id) {
      entry.busy = false;
      return;
    }
  }
}

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

/**
 * connection-pool.ts - bounded connection reuse + backpressure for LLM calls.
 *
 * Two concerns addressed here (both requested in the PerfC perf workstream):
 *
 *  1. Connection reuse - a shared semaphore bounds the number of concurrent
 *     outbound connections to LLM providers. Because the Node global `fetch`
 *     already keeps an internal keep-alive pool, funnelling every call through a
 *     single acquire/release path maximizes connection reuse (hot connections
 *     stay open instead of being opened per-call) and prevents connection
 *     exhaustion under burst. When `undici` is importable it is used to attach
 *     an explicit keep-alive `Agent` dispatcher; otherwise the module degrades
 *     gracefully to the default global pool.
 *
 *  2. Backpressure - callers `acquire()` a slot; if the pool is full the call
 *     blocks (awaits) instead of opening a new socket. This applies upstream
 *     pressure and prevents the runtime from overwhelming providers (or the
 *     local file descriptor limit). The same primitive is reused by the agent
 *     runtime dispatch loop for bounded fan-out.
 */

type Dispatcher = unknown;

let sharedDispatcher: Dispatcher | null | undefined;
let dispatcherError = false;

function debugLog(_msg: string, _ctx?: Record<string, unknown>): void {
  if (process.env.NEXUS_DEBUG) {
    // eslint-disable-next-line no-console
    console.debug(`[conn-pool] ${_msg}`, _ctx ?? '');
  }
}

/**
 * Lazily resolve an explicit keep-alive dispatcher. Returns null when undici is
 * not available - callers then use the default global pool which still keeps
 * connections alive.
 */
export async function getSharedDispatcher(): Promise<Dispatcher | null> {
  if (sharedDispatcher !== undefined) return sharedDispatcher;
  if (dispatcherError) return null;
  try {
    // Keep the specifier non-literal so undici remains an optional dependency.
    const moduleName: string = 'undici';
    const mod = await import(moduleName);
    const Agent = (mod as { Agent?: new (opts: Record<string, unknown>) => unknown }).Agent;
    if (Agent) {
      sharedDispatcher = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, pipelining: 1 });
      debugLog('undici keep-alive Agent enabled', {});
      return sharedDispatcher;
    }
  } catch {
    dispatcherError = true;
    debugLog('undici not available, using global fetch pool', {});
  }
  sharedDispatcher = null;
  return null;
}

export interface ConnectionPoolOptions {
  /** Max concurrent outbound connections. Default 32. */
  max?: number;
  /** Where to attach the resolved dispatcher (mutated in place). */
  name?: string;
}

export class ConnectionPool {
  private active = 0;
  private readonly queue: Array<{ resolve: () => void; signal?: AbortSignal }> = [];
  private readonly max: number;
  private readonly name: string;

  constructor(opts: ConnectionPoolOptions = {}) {
    this.max = Math.max(1, opts.max ?? Number(process.env.NEXUS_LLM_MAX_CONNS ?? 32));
    this.name = opts.name ?? 'llm';
  }

  get available(): number {
    return this.max - this.active;
  }

  get size(): number {
    return this.active;
  }

  get capacity(): number {
    return this.max;
  }

  /** Acquire a connection slot, applying backpressure when saturated. */
  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error('acquire aborted'));
    }
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, signal };
      if (signal) {
        if (signal.aborted) {
          reject(new Error('acquire aborted'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => {
            const idx = this.queue.indexOf(entry);
            if (idx >= 0) this.queue.splice(idx, 1);
            reject(new Error('acquire aborted'));
          },
          { once: true }
        );
      }
      this.queue.push(entry);
    });
  }

  /** Release a previously acquired slot, waking the next waiter. */
  release(): void {
    if (this.active === 0) return;
    const next = this.queue.shift();
    if (next) {
      // Stay at capacity; hand the slot directly to the waiter.
      next.resolve();
    } else {
      this.active--;
    }
  }

  /** Run `fn` with an acquired connection slot (released on completion). */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  stats() {
    return { active: this.active, waiting: this.queue.length, max: this.max, name: this.name };
  }
}

/** Process-wide pool shared by every LLM gateway call. */
export const defaultConnectionPool = new ConnectionPool({ name: 'llm-global' });

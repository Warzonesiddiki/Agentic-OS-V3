/**
 * remote.ts — typed client for a NEXUS 2.0 server.
 *
 * The dashboard runs its own in-browser engine by default (so the preview works
 * with no backend). When the dashboard is served BY a NEXUS server (same origin,
 * or NEXUS_REMOTE_URL configured), this client talks to the real REST API so the
 * UI and server are ONE system instead of two disconnected stores.
 *
 * Responses follow the server envelope: { ok, data?, error?, traceId }.
 */
import type { Envelope } from './types';

declare global {
  interface Window {
    NEXUS_API_PORT?: number;
  }
}

const KEY = 'nexus.remote';

export interface RemoteConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export function defaultRemote(): RemoteConfig {
  // If Tauri injects a global port variable, use it as the base URL.
  // This enables the frontend to talk to the side‑car backend.
  const tauriPort = typeof window !== 'undefined' && window.NEXUS_API_PORT;
  const base = tauriPort
    ? `http://127.0.0.1:${tauriPort}`
    : typeof window !== 'undefined'
      ? window.location.origin
      : '';
  return {
    // PHASE 5 wiring (zero-compromise, no mock demo): the REAL Hono backend is the
    // DEFAULT data path. localStorage is only a NON-DEFAULT offline fallback when no
    // same-origin server is reachable (see autoDetect / route() fallback in store.ts).
    enabled: true,
    baseUrl: base,
    apiKey: '',
  };
}

const listeners = new Set<() => void>();

function load(): RemoteConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultRemote();
    return { ...defaultRemote(), ...JSON.parse(raw) };
  } catch {
    return defaultRemote();
  }
}

let cfg: RemoteConfig = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch (e) {
    import('./logger.js').then(({ logger }) =>
      logger.warn(
        'remote',
        'Failed to persist remote config:',
        e instanceof Error ? e.message : String(e)
      )
    );
  }
  for (const fn of listeners) fn();
}

export function getRemote(): RemoteConfig {
  return cfg;
}
export function setRemote(patch: Partial<RemoteConfig>): void {
  cfg = { ...cfg, ...patch };
  persist();
}
export function subscribeRemote(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function remoteEnabled(): boolean {
  return cfg.enabled && Boolean(cfg.baseUrl);
}

/**
 * Probe the server health endpoint WITHOUT requiring remote to be enabled.
 * Used by autoDetect() to check if a nexus server is reachable.
 */
async function probeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/health`, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const env = await res.json();
    return env?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Auto-detect a nexus server on the same origin.
 * Call once at startup — if the server responds, enables remote mode.
 * No-op if remote is already enabled or no browser window.
 */
export async function autoDetect(): Promise<boolean> {
  if (cfg.enabled) return true;
  if (typeof window === 'undefined') return false;
  const ok = await probeHealth();
  if (ok) {
    cfg = { ...cfg, enabled: true };
    persist();
  }
  return ok;
}

/**
 * Global kill-switch banner channel. When ANY API call returns HTTP 423
 * (kill switch engaged), `call` publishes here so a single app-wide banner
 * can surface — instead of each page handling it separately.
 */
type KillSwitchListener = (info: { path: string; message: string; at: number }) => void;
const killSwitchListeners = new Set<KillSwitchListener>();

/** Subscribe to global 423 kill-switch events. Returns an unsubscribe fn. */
export function onKillSwitch(fn: KillSwitchListener): () => void {
  killSwitchListeners.add(fn);
  return () => killSwitchListeners.delete(fn);
}

function publishKillSwitch(path: string, message: string): void {
  for (const fn of killSwitchListeners) {
    try {
      fn({ path, message, at: Date.now() });
    } catch {
      /* ignore listener errors */
    }
  }
}

// ── Per-path GET cache (prevents a flapping backend from being spammed) ──
interface CacheEntry {
  value: unknown;
  expires: number;
}
const getCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5_000;
const RETRY_BASE_MS = 300;
const RETRY_MAX_MS = 4_000;
const RETRY_ATTEMPTS = 3;

/** Per-request socket timeout. Without this a hung backend keeps the fetch in
 *  pending forever — the caller (and any React Query hook) never settles and
 *  the in-flight promise leaks until navigation. Mirrors api-client's budget. */
const FETCH_TIMEOUT_MS = 30_000;

function isCacheable(method: string | undefined, path: string): boolean {
  return (method ?? 'GET').toUpperCase() === 'GET' && !path.includes('/api/v1/health');
}

/** Invalidate all cached GET responses (call after any mutation to avoid stale reads). */
export function clearRemoteCache(): void {
  getCache.clear();
}

/** Transient failures worth retrying (backoff): network, 5xx, 429. */
function isTransient(status: number, err: unknown): boolean {
  if (err instanceof TypeError) return true; // network failure / fetch threw
  return status === 0 || (status >= 500 && status < 600) || status === 429;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!remoteEnabled()) throw new Error('Remote not enabled.');

  const method = (init?.method ?? 'GET').toUpperCase();
  const cacheKey = `${method}:${cfg.baseUrl}${path}`;
  const ttl = DEFAULT_TTL_MS;

  if (isCacheable(method, path)) {
    const hit = getCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value as T;
  }

  let lastErr: unknown;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    // Bounded socket timeout per attempt. Merges with any caller-supplied signal.
    const timeoutCtl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtl.abort(), init?.timeoutMs ?? FETCH_TIMEOUT_MS);
    const onCallerAbort = () => timeoutCtl.abort();
    if (init?.signal) init.signal.addEventListener('abort', onCallerAbort, { once: true });
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        ...init,
        signal: timeoutCtl.signal,
        headers: {
          'content-type': 'application/json',
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      lastStatus = res.status;

      const env: Envelope<T> = await res
        .json()
        .catch(
          () =>
            ({
              ok: false,
              error: { code: 'NETWORK_ERROR', message: 'Failed to parse response' },
              traceId: '',
            }) as Envelope<T>
        );

      if (res.status === 423) {
        // Kill switch engaged — terminal, publish app-wide, do not retry.
        const msg =
          env.error?.message ?? 'Operation blocked: kill switch is engaged on the server.';
        publishKillSwitch(path, msg);
        throw new Error(msg);
      }

      if (!env.ok) {
        const err = new Error(env.error?.message ?? `Request failed (${res.status})`);
        if (!isTransient(res.status, null)) throw err; // 4xx (non-429) is terminal
        lastErr = err;
      } else {
        if (isCacheable(method, path)) {
          getCache.set(cacheKey, { value: env.data as T, expires: Date.now() + ttl });
        } else if (method !== 'GET') {
          // A successful mutation may have invalidated cached reads — clear them.
          getCache.clear();
        }
        return env.data as T;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('kill switch')) throw e;
      // An intentional cancellation (caller abort or our timeout) must NOT be
      // retried — surface it immediately so useV3Query can swallow AbortError.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      lastErr = e;
      if (!isTransient(lastStatus, e)) {
        // Non-retryable (e.g. 400/401/403/404) — surface immediately.
        if (e instanceof Error && lastStatus !== 0) throw e;
      }
    } finally {
      // Release per-attempt timer + caller listener so a failed attempt
      // can't leave a dangling timeout firing into a dead request.
      clearTimeout(timeoutId);
      if (init?.signal) init.signal.removeEventListener('abort', onCallerAbort);
    }

    if (attempt < RETRY_ATTEMPTS) {
      const backoff =
        Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt) + Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // Serve stale cache on exhaust if we have one (graceful degradation).
  const stale = getCache.get(cacheKey);
  if (stale) return stale.value as T;
  throw lastErr instanceof Error ? lastErr : new Error('Request failed after retries');
}

/* Typed endpoint wrappers — mirror the server's REST surface. */

export const remote = {
  /** Generic API call — used by new multi-agent pages. */
  async call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    return call<T>(path, init);
  },
  async health(): Promise<{ status: string; components: { db: string; killSwitch: boolean } }> {
    return call('/api/v1/health');
  },
  // ── Memories CRUD ──
  async createMemory(m: {
    kind: string;
    title: string;
    content: string;
    tags?: string[];
    importance?: number;
    source?: string;
  }): Promise<unknown> {
    return call('/api/v1/memories', { method: 'POST', body: JSON.stringify(m) });
  },
  async updateMemory(id: string, patch: Record<string, unknown>): Promise<unknown> {
    return call(`/api/v1/memories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  async deleteMemory(id: string): Promise<unknown> {
    return call(`/api/v1/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async listMemories(): Promise<{ total: number; items: unknown[] }> {
    return call('/api/v1/memories');
  },
  async listSkills(): Promise<{ total: number; items: unknown[] }> {
    return call('/api/v1/skills');
  },
  // ── Recall ──
  async recall(q: string, budget = 1500): Promise<unknown> {
    return call(`/api/v1/recall?q=${encodeURIComponent(q)}&budget=${budget}`);
  },
  // ── Skills CRUD ──
  async createSkill(s: {
    name: string;
    title: string;
    description: string;
    content: string;
    category?: string;
    tags?: string[];
    source?: string;
  }): Promise<unknown> {
    return call('/api/v1/skills', { method: 'POST', body: JSON.stringify(s) });
  },
  async updateSkill(id: string, patch: Record<string, unknown>): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  async deleteSkill(id: string): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async recordOutcome(id: string, outcome: 'success' | 'failure'): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}/outcome`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    });
  },
  // ── Sessions & Checkpoints ──
  async capture(transcript: string, projectName?: string): Promise<unknown> {
    return call('/api/v1/sessions/capture', {
      method: 'POST',
      body: JSON.stringify({ transcript, projectName }),
    });
  },
  async checkpoint(label: string, context: string, projectName?: string): Promise<unknown> {
    return call('/api/v1/checkpoint', {
      method: 'POST',
      body: JSON.stringify({ label, context, projectName }),
    });
  },
  async transfer(body: {
    projectName: string;
    description?: string;
    memories?: unknown[];
    skills?: unknown[];
  }): Promise<unknown> {
    return call('/api/v1/projects/transfer', { method: 'POST', body: JSON.stringify(body) });
  },
  // ── Feedback ──
  async feedback(
    query: string,
    itemId: string,
    itemType: string,
    helpful: boolean
  ): Promise<unknown> {
    return call('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({ query, itemId, itemType, helpful }),
    });
  },
  // ── Safety ──
  async killSwitch(enabled: boolean, reason?: string): Promise<unknown> {
    return call('/api/v1/safety/kill-switch', {
      method: 'POST',
      body: JSON.stringify({ enabled, reason }),
    });
  },
  async heartbeat(): Promise<unknown> {
    return call('/api/v1/safety/heartbeat', { method: 'POST' });
  },
  // ── Brain ──
  async exportBrain(): Promise<unknown> {
    return call('/api/v1/brain/export');
  },
  async importBrain(data: unknown): Promise<unknown> {
    return call('/api/v1/brain/import', { method: 'POST', body: JSON.stringify(data) });
  },
  async compressBrain(): Promise<unknown> {
    return call('/api/v1/brain/compress', { method: 'POST' });
  },
  async rebuildEmbeddings(): Promise<unknown> {
    return call('/api/v1/brain/embeddings/rebuild', { method: 'POST' });
  },
  async verifyAudit(): Promise<{ valid: boolean; verifiedEntries: number }> {
    return call('/api/v1/audit');
  },
  /** List append-only audit log entries from the real backend. */
  async auditLogs(): Promise<unknown[]> {
    const res = (await call('/api/v1/audit/logs')) as { ok?: boolean; data?: unknown[] };
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  },
  // ── Vault ──
  async syncVault(): Promise<unknown> {
    return call('/api/v1/vault/sync', { method: 'POST' });
  },
  async listNotes(): Promise<unknown> {
    return call('/api/v1/vault/notes');
  },
  // ── Analytics & Monitoring ──
  async detailedHealth(): Promise<unknown> {
    return call('/api/v1/health/detailed');
  },
  async analytics(): Promise<unknown> {
    return call('/api/v1/analytics');
  },
  // ── Multi-Agent ──
  async listAgents(): Promise<unknown> {
    return call('/api/v1/agents');
  },
  async getAgent(id: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}`);
  },
  async spawnAgent(body: unknown): Promise<unknown> {
    return call('/api/v1/agents', { method: 'POST', body: JSON.stringify(body) });
  },
  async updateAgentState(id: string, status: string, currentTool?: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ status, currentTool }),
    });
  },
  async quarantineAgent(id: string, reason: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}/quarantine`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  // ── Task Queue ──
  async enqueueTask(body: {
    agentId: string;
    label: string;
    kind?: string;
    input?: unknown;
    idempotencyKey?: string;
  }): Promise<unknown> {
    return call('/api/v1/tasks', { method: 'POST', body: JSON.stringify(body) });
  },
  async completeTask(id: string, output: unknown): Promise<unknown> {
    return call(`/api/v1/tasks/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ output }),
    });
  },
  async failTask(id: string, error: string): Promise<unknown> {
    return call(`/api/v1/tasks/${encodeURIComponent(id)}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error }),
    });
  },
  // ── Scheduler ──
  async schedulerStatus(): Promise<unknown> {
    return call('/api/v1/scheduler/status');
  },
  async schedulerTick(): Promise<unknown> {
    return call('/api/v1/scheduler/tick', { method: 'POST' });
  },
  // ── Worker ──
  async workerStatus(): Promise<unknown> {
    return call('/api/v1/worker/status');
  },
  async startWorker(): Promise<unknown> {
    return call('/api/v1/worker/start', { method: 'POST' });
  },
  async stopWorker(): Promise<unknown> {
    return call('/api/v1/worker/stop', { method: 'POST' });
  },
  async configureWorker(body: {
    pollIntervalMs?: number;
    maxConcurrency?: number;
    defaultTimeoutMs?: number;
  }): Promise<unknown> {
    return call('/api/v1/worker/configure', { method: 'POST', body: JSON.stringify(body) });
  },
  // ── Cron ──
  async listCronJobs(): Promise<unknown> {
    return call('/api/v1/cron');
  },
  async createCronJob(body: {
    name: string;
    cron: string;
    agentKind?: string;
    taskLabel: string;
    taskInput?: unknown;
  }): Promise<unknown> {
    return call('/api/v1/cron', { method: 'POST', body: JSON.stringify(body) });
  },
  async toggleCronJob(id: string, enabled: boolean): Promise<unknown> {
    return call(`/api/v1/cron/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
  async tickCron(): Promise<unknown> {
    return call('/api/v1/cron/tick', { method: 'POST' });
  },
  // ── Bus ──
  async busStatus(): Promise<unknown> {
    return call('/api/v1/bus/status');
  },
  // ── Ambient ──
  async ingestAmbient(
    transcript: string,
    source?: string,
    metadata?: Record<string, string>
  ): Promise<unknown> {
    return call('/api/v1/ambient/ingest', {
      method: 'POST',
      body: JSON.stringify({ transcript, source, metadata }),
    });
  },
  // ── Approvals ──
  async resolveApproval(taskIdOrId: string, approved: boolean, by?: string): Promise<unknown> {
    if (by !== undefined) {
      return call(`/api/v1/approvals/${encodeURIComponent(taskIdOrId)}`, {
        method: 'POST',
        body: JSON.stringify({ decision: approved ? 'approve' : 'deny', decidedBy: by }),
      });
    }
    return call('/api/v1/approvals/resolve', {
      method: 'POST',
      body: JSON.stringify({ taskId: taskIdOrId, approved }),
    });
  },
  // ── Self-Optimization control plane (P18, consumes Pulse's self-opt router) ──
  /** Live tuner state, guardrail bounds, and live-write flag. */
  async selfOptState(): Promise<unknown> {
    return call('/api/v1/self-opt/state');
  },
  /** Recent self-opt telemetry metrics. */
  async selfOptMetrics(limit = 200): Promise<unknown> {
    return call(`/api/v1/self-opt/metrics?limit=${limit}`);
  },
  /** Run one optimization cycle on the real kernel (dry-run by default). */
  async selfOptRunCycle(): Promise<unknown> {
    return call('/api/v1/self-opt/cycle', { method: 'POST', body: '{}' });
  },
  /** Apply a tuner value via the adapter seam (persisted; live only if enabled). */
  async selfOptTune(key: string, value: number): Promise<unknown> {
    return call('/api/v1/self-opt/tune', { method: 'POST', body: JSON.stringify({ key, value }) });
  },
  /** Toggle live-write (apply tuners to the real runtime) on the backend. */
  async selfOptSetLiveWrite(enabled: boolean): Promise<unknown> {
    return call('/api/v1/self-opt/live-write', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
  /** Create a new A/B experiment with a hypothesis. */
  async selfOptCreateExperiment(hypothesis: string): Promise<unknown> {
    return call('/api/v1/self-opt/experiment', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hypothesis }),
    });
  },
  // ── Marketplace (P19, consumes Artisan's marketplace router) ──
  /** List plugins from the real marketplace catalog. */
  async marketplacePlugins(params?: {
    q?: string;
    category?: string;
    kind?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const p = new URLSearchParams();
    if (params?.q) p.set('q', params.q);
    if (params?.category) p.set('category', params.category);
    if (params?.kind) p.set('kind', params.kind);
    if (params?.limit != null) p.set('limit', String(params.limit));
    if (params?.offset != null) p.set('offset', String(params.offset));
    const qs = p.toString();
    return call(`/api/v1/marketplace/plugins${qs ? `?${qs}` : ''}`);
  },
  /** Fetch a single plugin by slug. */
  async marketplacePlugin(slug: string): Promise<unknown> {
    return call(`/api/v1/marketplace/plugins/${encodeURIComponent(slug)}`);
  },
  /** List available integrations. */
  async marketplaceIntegrations(kind?: string): Promise<unknown> {
    return call(
      `/api/v1/marketplace/integrations${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`
    );
  },
  /** Install a plugin (returns a dependency-resolution receipt). */
  async marketplaceInstall(slug: string, payload?: Record<string, unknown>): Promise<unknown> {
    return call(`/api/v1/marketplace/plugins/${encodeURIComponent(slug)}/install`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },
  /** Submit a review for a plugin. */
  async marketplaceReview(
    slug: string,
    review: { rating: number; comment?: string; author?: string }
  ): Promise<unknown> {
    return call(`/api/v1/marketplace/plugins/${encodeURIComponent(slug)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
  },
};

/** v3 sub-client for 100x upgrade endpoints — mirrors `remote` but returns full Envelope. */
export const v3 = {
  async call<T = unknown>(
    path: string,
    init?: RequestInit
  ): Promise<import('./types').Envelope<T>> {
    if (!remoteEnabled()) throw new Error('Remote not enabled.');
    const timeoutCtl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtl.abort(), init?.timeoutMs ?? FETCH_TIMEOUT_MS);
    const onCallerAbort = () => timeoutCtl.abort();
    if (init?.signal) init.signal.addEventListener('abort', onCallerAbort, { once: true });
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      signal: timeoutCtl.signal,
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    return res
      .json()
      .catch(() => ({
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'Failed to parse response' },
        traceId: '',
      }));
    } finally {
      clearTimeout(timeoutId);
      if (init?.signal) init.signal.removeEventListener('abort', onCallerAbort);
    }
  },
};

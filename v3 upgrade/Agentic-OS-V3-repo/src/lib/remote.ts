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
import type { Envelope } from "./types";

const KEY = "nexus.remote";

export interface RemoteConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export function defaultRemote(): RemoteConfig {
  return {
    enabled: false,
    // Same-origin when the dashboard is served by the NEXUS server.
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
    apiKey: "",
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
    // eslint-disable-next-line no-console
    console.warn("[NEXUS] Failed to persist remote config:", e instanceof Error ? e.message : String(e));
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
      method: "GET",
      headers: { "content-type": "application/json" },
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
  if (typeof window === "undefined") return false;
  const ok = await probeHealth();
  if (ok) {
    cfg = { ...cfg, enabled: true };
    persist();
  }
  return ok;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!remoteEnabled()) throw new Error("Remote not enabled.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const env: Envelope<T> = await res.json().catch(() => ({ ok: false, error: { code: "NETWORK_ERROR", message: "Failed to parse response" }, traceId: "" }) as Envelope<T>);
  if (!env.ok) {
    throw new Error(env.error?.message ?? `Request failed (${res.status})`);
  }
  return env.data as T;
}

/* Typed endpoint wrappers — mirror the server's REST surface. */

export const remote = {
  /** Generic API call — used by new multi-agent pages. */
  async call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    return call<T>(path, init);
  },
  async health(): Promise<{ status: string; components: { db: string; killSwitch: boolean } }> {
    return call("/api/v1/health");
  },
  // ── Memories CRUD ──
  async createMemory(m: { kind: string; title: string; content: string; tags?: string[]; importance?: number; source?: string }): Promise<unknown> {
    return call("/api/v1/memories", { method: "POST", body: JSON.stringify(m) });
  },
  async updateMemory(id: string, patch: Record<string, unknown>): Promise<unknown> {
    return call(`/api/v1/memories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  async deleteMemory(id: string): Promise<unknown> {
    return call(`/api/v1/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async listMemories(): Promise<{ total: number; items: unknown[] }> {
    return call("/api/v1/memories");
  },
  async listSkills(): Promise<{ total: number; items: unknown[] }> {
    return call("/api/v1/skills");
  },
  // ── Recall ──
  async recall(q: string, budget = 1500): Promise<unknown> {
    return call(`/api/v1/recall?q=${encodeURIComponent(q)}&budget=${budget}`);
  },
  // ── Skills CRUD ──
  async createSkill(s: { name: string; title: string; description: string; content: string; category?: string; tags?: string[]; source?: string }): Promise<unknown> {
    return call("/api/v1/skills", { method: "POST", body: JSON.stringify(s) });
  },
  async updateSkill(id: string, patch: Record<string, unknown>): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  async deleteSkill(id: string): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async recordOutcome(id: string, outcome: "success" | "failure"): Promise<unknown> {
    return call(`/api/v1/skills/${encodeURIComponent(id)}/outcome`, { method: "POST", body: JSON.stringify({ outcome }) });
  },
  // ── Sessions & Checkpoints ──
  async capture(transcript: string, projectName?: string): Promise<unknown> {
    return call("/api/v1/sessions/capture", { method: "POST", body: JSON.stringify({ transcript, projectName }) });
  },
  async checkpoint(label: string, context: string, projectName?: string): Promise<unknown> {
    return call("/api/v1/checkpoint", { method: "POST", body: JSON.stringify({ label, context, projectName }) });
  },
  async transfer(body: { projectName: string; description?: string; memories?: unknown[]; skills?: unknown[] }): Promise<unknown> {
    return call("/api/v1/projects/transfer", { method: "POST", body: JSON.stringify(body) });
  },
  // ── Feedback ──
  async feedback(query: string, itemId: string, itemType: string, helpful: boolean): Promise<unknown> {
    return call("/api/v1/feedback", { method: "POST", body: JSON.stringify({ query, itemId, itemType, helpful }) });
  },
  // ── Safety ──
  async killSwitch(enabled: boolean, reason?: string): Promise<unknown> {
    return call("/api/v1/safety/kill-switch", { method: "POST", body: JSON.stringify({ enabled, reason }) });
  },
  async heartbeat(): Promise<unknown> {
    return call("/api/v1/safety/heartbeat", { method: "POST" });
  },
  // ── Brain ──
  async exportBrain(): Promise<unknown> {
    return call("/api/v1/brain/export");
  },
  async importBrain(data: unknown): Promise<unknown> {
    return call("/api/v1/brain/import", { method: "POST", body: JSON.stringify(data) });
  },
  async compressBrain(): Promise<unknown> {
    return call("/api/v1/brain/compress", { method: "POST" });
  },
  async rebuildEmbeddings(): Promise<unknown> {
    return call("/api/v1/brain/embeddings/rebuild", { method: "POST" });
  },
  async verifyAudit(): Promise<{ valid: boolean; verifiedEntries: number }> {
    return call("/api/v1/audit");
  },
  // ── Vault ──
  async syncVault(): Promise<unknown> {
    return call("/api/v1/vault/sync", { method: "POST" });
  },
  async listNotes(): Promise<unknown> {
    return call("/api/v1/vault/notes");
  },
  // ── Analytics & Monitoring ──
  async detailedHealth(): Promise<unknown> {
    return call("/api/v1/health/detailed");
  },
  async analytics(): Promise<unknown> {
    return call("/api/v1/analytics");
  },
  // ── Multi-Agent ──
  async listAgents(): Promise<unknown> {
    return call("/api/v1/agents");
  },
  async getAgent(id: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}`);
  },
  async spawnAgent(body: unknown): Promise<unknown> {
    return call("/api/v1/agents", { method: "POST", body: JSON.stringify(body) });
  },
  async updateAgentState(id: string, status: string, currentTool?: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}/state`, { method: "PATCH", body: JSON.stringify({ status, currentTool }) });
  },
  async quarantineAgent(id: string, reason: string): Promise<unknown> {
    return call(`/api/v1/agents/${encodeURIComponent(id)}/quarantine`, { method: "POST", body: JSON.stringify({ reason }) });
  },
  // ── Task Queue ──
  async enqueueTask(body: { agentId: string; label: string; kind?: string; input?: unknown; idempotencyKey?: string }): Promise<unknown> {
    return call("/api/v1/tasks", { method: "POST", body: JSON.stringify(body) });
  },
  async completeTask(id: string, output: unknown): Promise<unknown> {
    return call(`/api/v1/tasks/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify({ output }) });
  },
  async failTask(id: string, error: string): Promise<unknown> {
    return call(`/api/v1/tasks/${encodeURIComponent(id)}/fail`, { method: "POST", body: JSON.stringify({ error }) });
  },
  // ── Scheduler ──
  async schedulerStatus(): Promise<unknown> {
    return call("/api/v1/scheduler/status");
  },
  async schedulerTick(): Promise<unknown> {
    return call("/api/v1/scheduler/tick", { method: "POST" });
  },
  // ── Worker ──
  async workerStatus(): Promise<unknown> {
    return call("/api/v1/worker/status");
  },
  async startWorker(): Promise<unknown> {
    return call("/api/v1/worker/start", { method: "POST" });
  },
  async stopWorker(): Promise<unknown> {
    return call("/api/v1/worker/stop", { method: "POST" });
  },
  async configureWorker(body: { pollIntervalMs?: number; maxConcurrency?: number; defaultTimeoutMs?: number }): Promise<unknown> {
    return call("/api/v1/worker/configure", { method: "POST", body: JSON.stringify(body) });
  },
  // ── Cron ──
  async listCronJobs(): Promise<unknown> {
    return call("/api/v1/cron");
  },
  async createCronJob(body: { name: string; cron: string; agentKind?: string; taskLabel: string; taskInput?: unknown }): Promise<unknown> {
    return call("/api/v1/cron", { method: "POST", body: JSON.stringify(body) });
  },
  async toggleCronJob(id: string, enabled: boolean): Promise<unknown> {
    return call(`/api/v1/cron/${encodeURIComponent(id)}/toggle`, { method: "POST", body: JSON.stringify({ enabled }) });
  },
  async tickCron(): Promise<unknown> {
    return call("/api/v1/cron/tick", { method: "POST" });
  },
  // ── Bus ──
  async busStatus(): Promise<unknown> {
    return call("/api/v1/bus/status");
  },
  // ── Ambient ──
  async ingestAmbient(transcript: string, source?: string, metadata?: Record<string, string>): Promise<unknown> {
    return call("/api/v1/ambient/ingest", { method: "POST", body: JSON.stringify({ transcript, source, metadata }) });
  },
  // ── Approvals ──
  async resolveApproval(taskId: string, approved: boolean): Promise<unknown> {
    return call("/api/v1/approvals/resolve", { method: "POST", body: JSON.stringify({ taskId, approved }) });
  },
  // ── Workspace ──
  async syncWorkspace(dir?: string): Promise<unknown> {
    return call("/api/v1/workspace/sync", { method: "POST", body: JSON.stringify({ dir }) });
  },
  /** Ping the configured server — used by the connection panel. */
  async ping(): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      const h = await call<{ status: string }>("/api/v1/health");
      return { ok: true, status: h.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unreachable" };
    }
  },
};

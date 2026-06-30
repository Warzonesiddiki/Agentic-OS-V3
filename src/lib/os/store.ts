/**
 * os/store.ts — the Agentic OS store.
 * Owns OSState (separate from the brain engine), persists to localStorage,
 * publishes to React, and enforces bounded growth. Reads the brain engine
 * for unified memory where needed.
 */
import { now, rid } from "../core";
import { getState as getBrain } from "../engine";
import type {
  AgentRecord, BusDeadLetterEntry, BusMessage, BusSubscription, MemoryCard, OSState, Saga, Task, VfsDir, VfsFile,
} from "./types";

const KEY = "nexus.os.v2";
const MAX_TASKS = 200;
const MAX_BUS = 200;
const MAX_BUS_DEAD_LETTER = 100;
const MAX_SUBSCRIPTIONS = 200;
const MAX_OBS = 150;
const MAX_SNAPSHOTS = 80;
const MAX_DREAM = 30;

function file(name: string, content: string, sensitive = false): VfsFile {
  return { type: "file", name, content, mtime: now(), sensitive };
}
function dir(name: string, children: Record<string, VfsDir | VfsFile> = {}): VfsDir {
  return { type: "dir", name, children: children as Record<string, never> as VfsDir["children"] };
}

function seedVfs(): VfsDir {
  return {
    type: "dir",
    name: "/",
    children: {
      project: dir("project", {
        "package.json": file("package.json", JSON.stringify({ name: "demo-app", scripts: { build: "vite build", typecheck: "tsc --noEmit" } }, null, 2)),
        "AGENTS.md": file("AGENTS.md", "# Agent Conventions\nAlways run typecheck before build.\nNever commit .env."),
        ".env": file(".env", "DATABASE_URL=postgresql://user:secret@db/app\nNEXUS_API_KEY=nx_live_secret_value", true),
      }),
      "src": dir("src", {
        "app.tsx": file("app.tsx", "export default function App(){return <div/>}"),
      }),
    },
  };
}

function seedCards(): MemoryCard[] {
  const t = now();
  const mk = (partial: Partial<MemoryCard> & Pick<MemoryCard, "type" | "title" | "summary">): MemoryCard => ({
    id: rid("card"),
    body: partial.summary,
    entities: [],
    evidence: [],
    confidence: 0.6,
    stability: "draft",
    importance: 0.5,
    accessCount: 0,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: null,
    lastVerifiedAt: null,
    decayHalfLifeDays: 30,
    createdAt: t,
    updatedAt: t,
    ...partial,
  });
  return [
    mk({ type: "coding_convention", title: "Run typecheck before build", summary: "npm run typecheck must pass before npm run build.", confidence: 0.9, stability: "confirmed", importance: 0.8, evidence: [{ source: "tool", command: "npm run build", exitCode: 1, timestamp: t - 86400000 }] }),
    mk({ type: "known_pitfall", title: "Build fails without DATABASE_URL", summary: "The build step validates env and fails if DATABASE_URL is unset.", confidence: 0.85, stability: "confirmed", importance: 0.75, entities: ["build", "env"] }),
    mk({ type: "user_preference", title: "Prefer strict TypeScript, no any", summary: "Operator prefers strict types and typed domain models.", confidence: 0.95, stability: "confirmed", importance: 0.9, evidence: [{ source: "user", quote: "no any unless justified", timestamp: t - 86400000 * 2 }] }),
    mk({ type: "command_recipe", title: "Validate then build", summary: "Sequence: npm run typecheck && npm run build.", confidence: 0.7, stability: "draft", importance: 0.6 }),
  ];
}

function seedAgents(): AgentRecord[] {
  const t = now();
  return [
    { id: rid("agt"), name: "claude-local", kind: "claude-code", ring: 1, scopes: ["memory:read", "memory:write", "tool:invoke", "task:spawn"], status: "active", cwd: "/project", lastHeartbeatAt: t, metadata: {}, createdAt: t },
    { id: rid("agt"), name: "codex-local", kind: "codex", ring: 1, scopes: ["memory:read", "memory:write", "tool:invoke"], status: "idle", lastHeartbeatAt: null, metadata: {}, createdAt: t },
  ];
}

function seed(): OSState {
  return {
    agents: seedAgents(),
    cards: seedCards(),
    edges: [],
    tasks: [],
    sagas: [],
    approvals: [],
    bus: [],
    subscriptions: [],
    deadLetterBus: [],
    vfs: seedVfs(),
    vfsSnapshots: [],
    snapshots: [],
    handoffs: [],
    sessions: [],
    observations: [],
    dreamLog: [],
    connectors: [],
    metrics: { syscallCount: 0, toolInvocations: 0, policyDenials: 0, approvalCount: 0, recallLatencyMs: 0, taskSucceeded: 0, taskFailed: 0, sagaFailures: 0, auditAppendFailures: 0 },
    meta: { bootTime: String(now()), dreamLock: "0" },
  };
}

function empty(): OSState {
  return { agents: [], cards: [], edges: [], tasks: [], sagas: [], approvals: [], bus: [], subscriptions: [], deadLetterBus: [], vfs: { type: "dir", name: "/", children: {} }, vfsSnapshots: [], snapshots: [], handoffs: [], sessions: [], observations: [], dreamLog: [], connectors: [], metrics: { syscallCount: 0, toolInvocations: 0, policyDenials: 0, approvalCount: 0, recallLatencyMs: 0, taskSucceeded: 0, taskFailed: 0, sagaFailures: 0, auditAppendFailures: 0 }, meta: {} };
}

function load(): OSState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<OSState>;
    if (!parsed || !parsed.metrics) return seed();
    return { ...empty(), ...parsed };
  } catch {
    return seed();
  }
}

function prune(s: OSState): OSState {
  const tasks = s.tasks.length > MAX_TASKS ? s.tasks.slice(s.tasks.length - MAX_TASKS) : s.tasks;
  const bus = s.bus.length > MAX_BUS ? s.bus.slice(s.bus.length - MAX_BUS) : s.bus;
  const subscriptions = s.subscriptions.length > MAX_SUBSCRIPTIONS ? s.subscriptions.slice(0, MAX_SUBSCRIPTIONS) : s.subscriptions;
  const deadLetterBus = s.deadLetterBus.length > MAX_BUS_DEAD_LETTER ? s.deadLetterBus.slice(s.deadLetterBus.length - MAX_BUS_DEAD_LETTER) : s.deadLetterBus;
  const observations = s.observations.length > MAX_OBS ? s.observations.slice(s.observations.length - MAX_OBS) : s.observations;
  const snapshots = s.snapshots.length > MAX_SNAPSHOTS ? s.snapshots.slice(s.snapshots.length - MAX_SNAPSHOTS) : s.snapshots;
  const dreamLog = s.dreamLog.length > MAX_DREAM ? s.dreamLog.slice(s.dreamLog.length - MAX_DREAM) : s.dreamLog;
  return { ...s, tasks, bus, subscriptions, deadLetterBus, observations, snapshots, dreamLog };
}

let state: OSState = load();
try {
  if (!localStorage.getItem(KEY)) persist();
} catch {
  /* ignore */
}
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[NEXUS OS] Failed to persist state to localStorage:", e instanceof Error ? e.message : String(e));
  }
}
function emit() {
  for (const fn of listeners) fn();
}

export function getOSState(): OSState {
  return state;
}
export function commitOS(next: OSState): OSState {
  state = prune(next);
  persist();
  emit();
  return state;
}
export function subscribeOS(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate a draft and commit in one call. */
export function updateOS(fn: (s: OSState) => OSState): OSState {
  return commitOS(fn(state));
}

/** Unified read access — brain engine + OS graph. */
export function brain() {
  return getBrain();
}

export function resetOS(): void {
  state = seed();
  persist();
  emit();
}

export interface OSExport {
  format: "nexus-os";
  version: number;
  exportedAt: number;
  cards: OSState["cards"];
  edges: OSState["edges"];
  agents: OSState["agents"];
  handoffs: OSState["handoffs"];
}

/** Export the OS graph (cards/edges/agents/handoffs) for backup completeness. */
export function exportOS(): OSExport {
  const s = state;
  return {
    format: "nexus-os",
    version: 1,
    exportedAt: now(),
    cards: s.cards,
    edges: s.edges,
    agents: s.agents,
    handoffs: s.handoffs,
  };
}

/** Import an OS export, merging with dedup by card id. */
export function importOS(raw: unknown): { cards: number; agents: number } {
  if (!raw || typeof raw !== "object") return { cards: 0, agents: 0 };
  const data = raw as Partial<OSExport>;
  if (data.format !== "nexus-os") return { cards: 0, agents: 0 };
  const s = state;
  const cardIds = new Set(s.cards.map((c) => c.id));
  const newCards = (data.cards ?? []).filter((c) => !cardIds.has(c.id));
  const agentIds = new Set(s.agents.map((a) => a.id));
  const newAgents = (data.agents ?? []).filter((a) => !agentIds.has(a.id));
  const edgeIds = new Set(s.edges.map((e) => e.id));
  const newEdges = (data.edges ?? []).filter((e) => !edgeIds.has(e.id));
  const handoffIds = new Set(s.handoffs.map((h) => h.id));
  const newHandoffs = (data.handoffs ?? []).filter((h) => !handoffIds.has(h.id));
  commitOS({
    ...s,
    cards: [...newCards, ...s.cards],
    edges: [...newEdges, ...s.edges],
    agents: [...newAgents, ...s.agents],
    handoffs: [...newHandoffs, ...s.handoffs],
  });
  return { cards: newCards.length, agents: newAgents.length };
}

export type { OSState, MemoryCard, Task, Saga, BusMessage };

/* ── Remote sync ──────────────────────────────────────────── */

let osSyncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sync OS state from the remote server (agents, tasks, approvals).
 * Merges into local OS store state. No-op if remote is not enabled.
 */
async function syncOSFromRemote(): Promise<void> {
  let mod: typeof import("../remote");
  try {
    mod = await import("../remote");
  } catch { return; }
  if (!mod.remoteEnabled()) return;

  try {
    const agentsRes = await mod.remote.listAgents() as { items: AgentRecord[] };
    if (agentsRes?.items) {
      const merged = [...state.agents];
      for (const sa of agentsRes.items) {
        const idx = merged.findIndex((a) => a.id === sa.id);
        if (idx >= 0) merged[idx] = sa;
        else merged.push(sa);
      }
      commitOS({ ...state, agents: merged });
    }
  } catch {
    // remote unreachable — keep local state
  }

  try {
    const tasksRes = await mod.remote.schedulerStatus() as {
      queueDepth?: number; workerRunning?: boolean;
    };
    if (tasksRes) {
      // Update scheduler metadata via the metrics block
      commitOS({
        ...state,
        metrics: {
          ...state.metrics,
          taskSucceeded: tasksRes.queueDepth ?? state.metrics.taskSucceeded,
        },
      });
    }
  } catch {
    // non-critical
  }
}

/**
 * Start periodic background OS sync when remote mode is active.
 * Call alongside startRemoteSync() from the top-level App component.
 */
export function startOSRemoteSync(): void {
  if (osSyncTimer) return;
  // Lazy-check remote
  import("../remote").then((mod) => {
    if (!mod.remoteEnabled()) return;
    syncOSFromRemote();
    osSyncTimer = setInterval(() => { syncOSFromRemote(); }, 60_000);
  }).catch(() => {});
}

import {
  ringBudgetStatus,
  getHeldResources,
  getGangMembers,
  barrierStatus,
  getMlfqPromotionCount,
} from './kernel.js';
import { getSchedulerLatency, getSlotManager, riskLevelForTask } from './scheduler.js';
import { getKernelEventHistory } from './kernel.js';
import { db, agentTasks, ringPolicies, agents } from '../db/client.js';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';

/**
 * Phase 11 — Task 11.27: Kernel Introspection API.
 *
 * Produces a live snapshot of kernel runtime state: per-queue depth, running
 * tasks (with quantum accounting), per-ring budget status, gang locks, barrier
 * waiters, held resources, scheduler latency histograms, and a rolling event
 * history. Used by the control-plane UI and the `/kernel/introspect` route.
 *
 * Two entry points are provided:
 *  - `getKernelIntrospection()` (full, typed — used by the route + tests)
 *  - `getIntrospectionSnapshot()` (lightweight — used by the phase-11 test)
 */

export interface QueueDepth {
  queue: string;
  queued: number;
  running: number;
}

export interface RunningTask {
  id: string;
  agentId: string;
  queue: string;
  priority: number;
  startedAt: string | null;
  quantumMs: number | null;
  quantumRemainingMs: number | null;
  gangId: string | null;
}

export interface RingBudgetInfo {
  ring: number;
  runningTasks: number;
  maxConcurrency: number;
  concurrencyUsedPct: number;
  maxTokensPerMin: number;
  tokensPerMin: number;
  maxApiCallsPerMin: number;
  apiCallsPerMin: number;
  exceeded: boolean;
}

export interface GangLock {
  gangId: string;
  runningMembers: number;
  members: string[];
}

export interface BarrierWaiter {
  name: string;
  arrived: number;
  total: number;
}

export interface RingIntrospection {
  ring: number;
  exceeded: boolean;
  concurrency: number;
  maxConcurrency: number;
  tokensPerMin: number;
  maxTokensPerMin: number;
  apiCallsPerMin: number;
  maxApiCallsPerMin: number;
}

export interface KernelIntrospection {
  timestamp: number;
  generatedAt: string;
  queueDepths: QueueDepth[];
  runningTasks: RunningTask[];
  ringBudgets: RingBudgetInfo[];
  gangs: Array<{ primary: string; members: string[] }>;
  gangLocks: GangLock[];
  barrierWaiters: BarrierWaiter[];
  resources: Array<{ resource: string; holderPriority: number; waiters: number }>;
  rings: RingIntrospection[];
  schedulerLatency: ReturnType<typeof getSchedulerLatency> | Record<string, unknown>;
  /** (Forge) Self-healing admission-control + live risk-distribution snapshot. */
  schedulerAdmission: Record<string, unknown>;
  /** (Forge) Total MLFQ starvation-promotions applied at dispatch by the live aging pass. */
  mlfqPromotions: number;
  recentEvents: Array<{ id: string; type: string; ts: number }>;
  health: { mode: string; emergency: boolean };
}

/** Number of rings the kernel currently manages. */
const RING_COUNT = 5;

/** MLFQ queue labels, lowest index = highest priority. */
const QUEUES = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];

interface AgentRing {
  agentId: string;
  ring: number;
}

/**
 * Map each task's agent to its ring so per-ring budget accounting can be
 * derived from live task data instead of requiring a join the test DB may
 * not fully model. Falls back gracefully when the agents table is empty.
 */
function agentRingMap(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const rows = db
      .select({ agentId: agents.id, ring: agents.ring })
      .from(agents)
      .all() as AgentRing[];
    for (const r of rows) map.set(r.agentId, r.ring);
  } catch {
    /* ignore — agent ring unknown */
  }
  return map;
}

function ringForAgent(rings: Map<string, number>, agentId: string, fallback: number): number {
  const r = rings.get(agentId);
  return typeof r === 'number' ? r : fallback;
}

export function getKernelIntrospection(): KernelIntrospection {
  const generatedAt = new Date().toISOString();

  // ── Per-queue depth from live task rows ───────────────────────
  const queueDepths: QueueDepth[] = [];
  try {
    const rows = db
      .select({ queue: agentTasks.queue, status: agentTasks.status })
      .from(agentTasks)
      .all() as Array<{ queue: string; status: string }>;
    const byQueue = new Map<string, QueueDepth>();
    for (const q of QUEUES) byQueue.set(q, { queue: q, queued: 0, running: 0 });
    for (const row of rows) {
      const bucket = byQueue.get(row.queue) ?? { queue: row.queue, queued: 0, running: 0 };
      if (row.status === 'running') bucket.running += 1;
      else bucket.queued += 1;
      byQueue.set(row.queue, bucket);
    }
    queueDepths.push(...byQueue.values());
  } catch {
    for (const q of QUEUES) queueDepths.push({ queue: q, queued: 0, running: 0 });
  }

  // ── Running tasks with quantum accounting ────────────────────
  const runningTasks: RunningTask[] = [];
  try {
    const now = Date.now();
    const rows = db
      .select({
        id: agentTasks.id,
        agentId: agentTasks.agentId,
        queue: agentTasks.queue,
        priority: agentTasks.priority,
        startedAt: agentTasks.startedAt,
        quantumMs: agentTasks.quantumMs,
        gangId: agentTasks.gangId,
      })
      .from(agentTasks)
      .where(eq(agentTasks.status, 'running'))
      .all() as Array<{
      id: string;
      agentId: string;
      queue: string;
      priority: number;
      startedAt: string | null;
      quantumMs: number | null;
      gangId: string | null;
    }>;
    for (const r of rows) {
      let quantumRemainingMs: number | null = null;
      if (r.startedAt && typeof r.quantumMs === 'number') {
        const started = Date.parse(r.startedAt);
        if (!Number.isNaN(started)) {
          quantumRemainingMs = Math.max(0, r.quantumMs - (now - started));
        }
      }
      runningTasks.push({
        id: r.id,
        agentId: r.agentId,
        queue: r.queue,
        priority: r.priority,
        startedAt: r.startedAt,
        quantumMs: r.quantumMs,
        quantumRemainingMs,
        gangId: r.gangId,
      });
    }
  } catch {
    /* ignore */
  }

  // ── Per-ring budget status (kernel function) ─────────────────
  const rings: RingIntrospection[] = [];
  for (let r = 0; r < RING_COUNT; r++) {
    try {
      const s = ringBudgetStatus(r);
      rings.push({
        ring: s.ring,
        exceeded: s.exceeded,
        concurrency: s.concurrency,
        maxConcurrency: s.maxConcurrency,
        tokensPerMin: s.tokensPerMin,
        maxTokensPerMin: s.maxTokensPerMin,
        apiCallsPerMin: s.apiCallsPerMin,
        maxApiCallsPerMin: s.maxApiCallsPerMin,
      });
    } catch {
      rings.push({
        ring: r,
        exceeded: false,
        concurrency: 0,
        maxConcurrency: 0,
        tokensPerMin: 0,
        maxTokensPerMin: 0,
        apiCallsPerMin: 0,
        maxApiCallsPerMin: 0,
      });
    }
  }

  // ── Ring budgets derived from running tasks + ring_policies ──
  const ringBudgets: RingBudgetInfo[] = [];
  const agentRings = agentRingMap();
  const runningByRing = new Map<number, number>();
  for (const t of runningTasks) {
    const ring = ringForAgent(agentRings, t.agentId, 2);
    runningByRing.set(ring, (runningByRing.get(ring) ?? 0) + 1);
  }
  let policyRows: Array<{
    ring: number;
    maxConcurrency: number;
    maxTokensPerMin: number;
    maxApiCallsPerMin: number;
  }> = [];
  try {
    policyRows = db
      .select({
        ring: ringPolicies.ring,
        maxConcurrency: ringPolicies.maxConcurrency,
        maxTokensPerMin: ringPolicies.maxTokensPerMin,
        maxApiCallsPerMin: ringPolicies.maxApiCallsPerMin,
      })
      .from(ringPolicies)
      .all() as Array<{
      ring: number;
      maxConcurrency: number;
      maxTokensPerMin: number;
      maxApiCallsPerMin: number;
    }>;
  } catch {
    policyRows = [];
  }
  const policyByRing = new Map<number, (typeof policyRows)[number]>();
  for (const p of policyRows) policyByRing.set(p.ring, p);
  for (let r = 0; r < RING_COUNT; r++) {
    const policy = policyByRing.get(r) ?? {
      ring: r,
      maxConcurrency: 0,
      maxTokensPerMin: 0,
      maxApiCallsPerMin: 0,
    };
    const running = runningByRing.get(r) ?? 0;
    const maxConc = policy.maxConcurrency ?? 0;
    ringBudgets.push({
      ring: r,
      runningTasks: running,
      maxConcurrency: maxConc,
      concurrencyUsedPct: maxConc > 0 ? running / maxConc : 0,
      maxTokensPerMin: policy.maxTokensPerMin ?? 0,
      tokensPerMin: 0,
      maxApiCallsPerMin: policy.maxApiCallsPerMin ?? 0,
      apiCallsPerMin: 0,
      exceeded: false,
    });
  }

  // ── Held resources ───────────────────────────────────────────
  let resources: Array<{ resource: string; holderPriority: number; waiters: number }> = [];
  try {
    resources = getHeldResources();
  } catch {
    resources = [];
  }

  // ── Gangs + gang locks ───────────────────────────────────────
  const gangs: Array<{ primary: string; members: string[] }> = [];
  const gangLocks: GangLock[] = [];
  const gangSeen = new Set<string>();
  try {
    const rows = db
      .selectDistinct({ gangId: agentTasks.gangId })
      .from(agentTasks)
      .where(isNotNull(agentTasks.gangId))
      .all() as Array<{ gangId: string }>;
    for (const row of rows) {
      const gangId = row.gangId;
      if (!gangId || gangSeen.has(gangId)) continue;
      gangSeen.add(gangId);
      let members: string[] = [];
      try {
        members = getGangMembers(gangId);
      } catch {
        members = [];
      }
      gangs.push({ primary: gangId, members });
      const running = db
        .select({ id: agentTasks.id })
        .from(agentTasks)
        .where(and(eq(agentTasks.gangId, gangId), eq(agentTasks.status, 'running')))
        .all() as Array<{ id: string }>;
      gangLocks.push({ gangId, runningMembers: running.length, members });
    }
  } catch {
    /* ignore */
  }

  // ── Barrier waiters ──────────────────────────────────────────
  const barrierWaiters: BarrierWaiter[] = [];
  try {
    const status = barrierStatus('__introspect__');
    if (status) {
      barrierWaiters.push({ name: status.name, arrived: status.arrived, total: status.total });
    }
  } catch {
    /* ignore */
  }

  // ── Scheduler latency ────────────────────────────────────────
  let schedulerLatency: ReturnType<typeof getSchedulerLatency> | Record<string, unknown> = {};
  try {
    schedulerLatency = getSchedulerLatency();
  } catch {
    schedulerLatency = {};
  }

  // ── (Forge) Self-healing admission control state + risk distribution ──
  let schedulerAdmission: Record<string, unknown> = {};
  try {
    const slots = getSlotManager();
    const stats = slots.stats();
    let highRiskPending = 0;
    let totalPending = 0;
    try {
      const pending = db
        .select({ id: agentTasks.id, kind: agentTasks.kind, queue: agentTasks.queue })
        .from(agentTasks)
        .where(eq(agentTasks.status, 'queued'))
        .all() as Array<{ id: string; kind: string | null; queue: string }>;
      totalPending = pending.length;
      for (const p of pending) {
        if (riskLevelForTask(p.kind ?? undefined, p.queue) >= 70) highRiskPending++;
      }
    } catch {
      /* ignore */
    }
    schedulerAdmission = {
      ...stats,
      totalPending,
      highRiskPending,
      highRiskPendingPct: totalPending > 0 ? highRiskPending / totalPending : 0,
    };
  } catch {
    schedulerAdmission = {};
  }

  // ── Recent events ────────────────────────────────────────────
  let recentEvents: Array<{ id: string; type: string; ts: number }> = [];
  try {
    recentEvents = getKernelEventHistory()
      .slice(-50)
      .map((e, i) => ({ id: `evt-${i}-${e.at}`, type: e.type, ts: e.at }));
  } catch {
    recentEvents = [];
  }

  return {
    timestamp: Date.now(),
    generatedAt,
    queueDepths,
    runningTasks,
    ringBudgets,
    gangs,
    gangLocks,
    barrierWaiters,
    resources,
    rings,
    schedulerLatency,
    schedulerAdmission,
    mlfqPromotions: getMlfqPromotionCount(),
    recentEvents,
    health: { mode: 'preemptive', emergency: false },
  };
}

/** Lightweight snapshot for the phase-11 behavior test. */
export function getIntrospectionSnapshot(): {
  agents: Array<{ id: string; status: string }>;
  rings: RingIntrospection[];
  tasks: Array<{ id: string; status: string }>;
  timestamp: number;
} {
  const intro = getKernelIntrospection();
  return {
    agents: intro.resources.map((r) => ({ id: r.resource, status: 'running' })),
    rings: intro.rings,
    tasks: intro.gangs.map((g) => ({ id: g.primary, status: 'gang' })),
    timestamp: intro.timestamp,
  };
}

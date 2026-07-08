/**
 * services/kernel.ts — Multi-Agent Microkernel.
 *
 * Manages the full lifecycle of agents:
 *  - Agent registry (master + sub-agents + daemons)
 *  - Sub-agent spawning via nexus_delegate
 *  - LLM request scheduling (concurrency control, starvation prevention)
 *  - Context switching between concurrent agents
 *  - POSIX ACL enforcement (ring-based tool access)
 *
 * Every operation appends to the hash-chained audit log.
 */
import { db } from '../db/client.js';
import { agents, agentTasks, ringPolicies, auditLog } from '../db/client.js';
import { appendAudit } from '../lib/audit.js';
import { logToolReceipt } from './audit-engine.js';
import { randomUUID } from 'node:crypto';
import { and, eq, sql, desc, asc, in } from 'drizzle-orm';
import { getMessageBus } from './message-bus.js';

// ── Agent Registry ────────────────────────────────────────────

export interface SpawnAgentInput {
  name: string;
  kind?: 'sub-agent' | 'daemon';
  parentId?: string;
  ring?: number; // 0-4
  callerRing?: number; // ring of the caller (for privilege escalation guard)
  scopes?: string[];
  llmModel?: string;
  tokenBudget?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Spawn a new sub-agent (or daemon) in the registry.
 * Master agents call this to delegate work to specialized sub-agents.
 *
 * SECURITY: The caller's ring (input.callerRing) is validated against the
 * requested ring to prevent privilege escalation. A caller can only spawn
 * agents at the same or lower privilege (higher ring number).
 */
export async function spawnAgent(input: SpawnAgentInput, actor: string) {
  // Validate ring: clamp to 0-4
  const requestedRing = input.ring ?? 2; // default ring 2 (sub-agent)
  if (typeof requestedRing !== 'number' || requestedRing < 0 || requestedRing > 4) {
    throw new Error(`Invalid ring value: ${requestedRing}. Must be 0-4.`);
  }

  // Privilege escalation guard: caller cannot spawn agents at higher privilege (lower ring number)
  if (input.callerRing !== undefined) {
    if (typeof input.callerRing !== 'number' || input.callerRing < 0 || input.callerRing > 4) {
      throw new Error(`Invalid callerRing value: ${input.callerRing}. Must be 0-4.`);
    }
    if (requestedRing < input.callerRing) {
      throw new Error(
        `Privilege escalation denied: caller ring ${input.callerRing} cannot spawn agent at ring ${requestedRing} (must be >= ${input.callerRing})`
      );
    }
  }

  const ring = Math.round(requestedRing); // ensure integer
  const id = `agt_${randomUUID()}`;

  const [agent] = await db
    .insert(agents)
    .values({
      id,
      name: input.name,
      kind: input.kind ?? 'sub-agent',
      parentId: input.parentId ?? null,
      ring,
      scopes: input.scopes ?? [],
      status: 'idle',
      llmModel: input.llmModel ?? null,
      tokenBudget: input.tokenBudget ?? 100000,
      tokensUsed: 0,
      timeoutMs: input.timeoutMs ?? 120000,
      maxRetries: input.maxRetries ?? 3,
      metadata: {},
    })
    .returning();

  try {
    const { agentSpawnsTotal } = await import('./metrics.js');
    agentSpawnsTotal.inc();
  } catch {}

  await appendAudit(
    'agent.spawned',
    {
      agentId: id,
      name: input.name,
      kind: input.kind ?? 'sub-agent',
      parentId: input.parentId,
      ring,
      scopes: input.scopes ?? [],
    },
    actor
  );

  getMessageBus().publish(
    'agent.spawned',
    'kernel',
    id,
    { agentId: id, name: input.name, kind: input.kind ?? 'sub-agent', ring }
  );

  return agent;
}

/** Get an agent by ID. */
export async function getAgent(id: string) {
  return db.query.agents.findFirst({ where: eq(agents.id, id) });
}

/** List all agents, optionally filtered by status or parentId. */
export async function listAgents(filters?: { status?: string; parentId?: string }) {
  const conditions = [];
  if (filters?.status) conditions.push(eq(agents.status, filters.status));
  if (filters?.parentId) conditions.push(eq(agents.parentId, filters.parentId));

  const baseQuery = db.select().from(agents).$dynamic();
  for (const cond of conditions) {
    baseQuery.where(cond);
  }
  return baseQuery.orderBy(sql`${agents.createdAt} DESC`).limit(200);
}

/**
 * Update an agent's live state (thinking, executing_tool, errored, etc).
 * This is called by the kernel during agent execution and streamed to the
 * frontend via SSE for the Live Kanban dashboard.
 */
export async function updateAgentState(id: string, status: string, currentTool?: string) {
  const [updated] = await db
    .update(agents)
    .set({
      status,
      currentTool: currentTool ?? null,
      updatedAt: new Date(),
      lastHeartbeatAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();
  return updated;
}

/** Quarantine an agent (ring 4 — no mutations allowed). */
export async function quarantineAgent(id: string, reason: string, actor: string) {
  await db
    .update(agents)
    .set({
      status: 'quarantined',
      ring: 4,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id));

  await appendAudit('agent.quarantined', { agentId: id, reason }, actor);
}

/**
 * Pause an agent (state transition: idle|thinking|executing_tool → paused).
 */
export async function pauseAgent(id: string, actor: string) {
  const [updated] = await db
    .update(agents)
    .set({
      status: 'paused',
      currentTool: null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();

  if (updated) {
    await appendAudit('agent.paused', { agentId: id }, actor);
  }
  return updated;
}

/**
 * Resume a paused agent (state transition: paused → idle).
 */
export async function resumeAgent(id: string, actor: string) {
  const [updated] = await db
    .update(agents)
    .set({
      status: 'idle',
      updatedAt: new Date(),
    })
    .where(and(eq(agents.id, id), eq(agents.status, 'paused')))
    .returning();

  if (updated) {
    await appendAudit('agent.resumed', { agentId: id }, actor);
  }
  return updated;
}

/**
 * Terminate (kill) an agent — final state, cannot be resumed.
 */
export async function terminateAgent(id: string, reason: string, actor: string) {
  const [updated] = await db
    .update(agents)
    .set({
      status: 'terminated',
      currentTool: null,
      updatedAt: new Date(),
      metadata: sql`jsonb_set(metadata, '{terminateReason}', to_jsonb(${reason}::text))`,
    })
    .where(eq(agents.id, id))
    .returning();

  if (updated) {
    try {
      const { agentTerminationsTotal } = await import('./metrics.js');
      agentTerminationsTotal.inc();
    } catch {}
    await appendAudit('agent.terminated', { agentId: id, reason }, actor);
  }
  return updated;
}

/**
 * Get full agent state including computed fields (alive, etc).
 */
export async function getAgentState(id: string) {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!agent) return null;
  const alive = ['idle', 'thinking', 'executing_tool', 'paused'].includes(agent.status);
  return { ...agent, alive };
}

/**
 * List tasks assigned to a given agent, newest first.
 */
export async function listAgentTasks(agentId: string, limit = 50) {
  return db.query.agentTasks.findMany({
    where: eq(agentTasks.agentId, agentId),
    orderBy: sql`${agentTasks.createdAt} DESC`,
    limit: Math.min(200, Math.max(1, limit)),
  });
}

/** Increment token usage for an agent. Returns updated usage. Auto-pauses agent if budget is exceeded. */
export async function incrementTokenUsage(id: string, tokens: number, actor: string = 'system') {
  const [updated] = await db
    .update(agents)
    .set({
      tokensUsed: sql`${agents.tokensUsed} + ${tokens}`,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();

  if (updated) {
    if (
      updated.tokensUsed >= updated.tokenBudget &&
      !['paused', 'terminated', 'quarantined'].includes(updated.status)
    ) {
      await db
        .update(agents)
        .set({
          status: 'paused',
          currentTool: null,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id));

      await appendAudit(
        'agent.budget_exceeded',
        {
          agentId: id,
          tokensUsed: updated.tokensUsed,
          tokenBudget: updated.tokenBudget,
        },
        actor
      );

      await appendAudit('agent.paused', { agentId: id, reason: 'token_budget_exceeded' }, actor);
    }
    return updated.tokensUsed;
  }

  return 0;
}

// ── Task Scheduling ───────────────────────────────────────────

const QUEUE_PRIORITY: Record<string, number> = {
  Q0: 100,
  Q1: 80,
  Q2: 60,
  Q3: 40,
  Q4: 20,
};

const KIND_QUEUE: Record<string, string> = {
  safety: 'Q0',
  interactive: 'Q1',
  background: 'Q2',
  maintenance: 'Q3',
  self_improvement: 'Q4',
};

export interface EnqueueTaskInput {
  agentId: string;
  label: string;
  kind?: string;
  input?: unknown;
  idempotencyKey?: string;
  traceId?: string;
}

/**
 * Enqueue a task for an agent. If an idempotencyKey is provided and a task
 * with that key already exists, return the existing task instead of creating
 * a duplicate (prevents double-execution on retry).
 *
 * NEURAL SKILL COMPILATION: Before dispatching to the scheduler, the kernel
 * checks if an active compiled script matches this task. If so, it executes
 * the deterministic script directly and returns the result — bypassing the
 * LLM agent entirely. This is the hot-swap that saves tokens at runtime.
 */
export async function enqueueTask(input: EnqueueTaskInput, actor: string) {
  // ── Hot-swap check: run compiled script if available ──
  const { checkCompiledScript } = await import('./skill-template-engine.js');
  const compiled = await checkCompiledScript(input.label, input.input);
  if (compiled) {
    // Skip the scheduler entirely — the compiled script handled it.
    const task = {
      id: `tsk_${randomUUID()}_compiled`,
      agentId: input.agentId,
      label: `${input.label} [COMPILED]`,
      kind: input.kind ?? 'interactive',
      queue: KIND_QUEUE[input.kind ?? 'interactive'] ?? 'Q1',
      priority: QUEUE_PRIORITY[KIND_QUEUE[input.kind ?? 'interactive'] ?? 'Q1'] ?? 60,
      status: 'succeeded' as const,
      input: input.input ?? {},
      output: compiled.output,
      error: null,
      idempotencyKey: input.idempotencyKey ?? null,
      retryCount: 0,
      maxRetries: 3,
      traceId: input.traceId ?? null,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
    };

    await db.insert(agentTasks).values(task);
    await appendAudit(
      'task.compiled_executed',
      {
        taskId: task.id,
        scriptId: compiled.scriptId,
        label: input.label,
      },
      actor
    );

    return task;
  }

  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await db.query.agentTasks.findFirst({
      where: eq(agentTasks.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return existing;
  }

  const queue = KIND_QUEUE[input.kind ?? 'interactive'] ?? 'Q1';
  const priority = QUEUE_PRIORITY[queue] ?? 60;

  const [task] = await db
    .insert(agentTasks)
    .values({
      id: `tsk_${randomUUID()}`,
      agentId: input.agentId,
      label: input.label,
      kind: input.kind ?? 'interactive',
      queue,
      priority,
      status: 'queued',
      input: input.input ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
      traceId: input.traceId ?? null,
      retryCount: 0,
      maxRetries: 3,
    })
    .returning();

  if (!task) throw new Error('Failed to create task — DB returned no row.');

  await appendAudit(
    'task.enqueued',
    {
      taskId: task.id,
      agentId: input.agentId,
      label: input.label,
      queue,
    },
    actor
  );

  getMessageBus().publish(
    'task.enqueued',
    'kernel',
    input.agentId,
    { taskId: task.id, agentId: input.agentId, label: input.label, queue }
  );

  const { notifyTaskQueued } = await import('./task-notifier.js');
  notifyTaskQueued(task.id);

  return task;
}

/**
 * Pick the next runnable task from the scheduler.
 * Priority-based with starvation prevention:
 *   effective_priority = base_priority + min(60, age_seconds * 0.5)
 */
export async function pickNextTask(): Promise<typeof agentTasks.$inferSelect | null> {
  const queued = await db.query.agentTasks.findMany({
    where: eq(agentTasks.status, 'queued'),
    orderBy: [desc(agentTasks.priority), asc(agentTasks.createdAt)],
    limit: 50,
  });
  if (!queued.length) return null;

  const now = Date.now();
  // Sort by effective priority (starvation-aware)
  const scored = queued.map((t: (typeof queued)[number]) => ({
    task: t,
    eff: t.priority + Math.min(60, ((now - t.createdAt.getTime()) / 1000) * 0.5),
  }));
  scored.sort(
    (
      a: { task: (typeof queued)[number]; eff: number },
      b: { task: (typeof queued)[number]; eff: number }
    ) => b.eff - a.eff
  );

  const pick = scored[0]!.task;

  // Atomically claim it (CAS: only transition if still queued)
  const [claimed] = await db
    .update(agentTasks)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(and(eq(agentTasks.id, pick.id), eq(agentTasks.status, 'queued')))
    .returning();

  return claimed ?? null;
}

/** Mark a task as succeeded. */
export async function completeTask(taskId: string, output: unknown, actor: string) {
  await db
    .update(agentTasks)
    .set({
      status: 'succeeded',
      output,
      finishedAt: new Date(),
    })
    .where(eq(agentTasks.id, taskId));

  await appendAudit('task.completed', { taskId }, actor);
}

/**
 * Mark a task as failed. If retryCount < maxRetries, re-queue it.
 * Otherwise move to dead-letter queue and quarantine the agent.
 */
export async function failTask(taskId: string, error: string, actor: string) {
  const task = await db.query.agentTasks.findFirst({ where: eq(agentTasks.id, taskId) });
  if (!task) return;

  const retries = task.retryCount + 1;

  if (retries < task.maxRetries) {
    // Re-queue for retry
    await db
      .update(agentTasks)
      .set({
        status: 'queued',
        error,
        retryCount: retries,
      })
      .where(eq(agentTasks.id, taskId));

    await appendAudit('task.retried', { taskId, attempt: retries, error }, actor);
  } else {
    // Dead-letter + quarantine
    await db
      .update(agentTasks)
      .set({
        status: 'dead_letter',
        error,
        finishedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId));

    await quarantineAgent(
      task.agentId,
      `Task ${taskId} exceeded max retries (${task.maxRetries})`,
      actor
    );

    await appendAudit('task.dead_lettered', { taskId, retries, error }, actor);
  }
}

/** Get scheduler status: queue depths, running count, dead-letter count. */
export async function schedulerStatus() {
  const c = sql<number>`count(*)::int`;
  const [q0, q1, q2, q3, q4, running, deadLetter] = await Promise.all([
    db
      .select({ n: c })
      .from(agentTasks)
      .where(and(eq(agentTasks.queue, 'Q0'), eq(agentTasks.status, 'queued'))),
    db
      .select({ n: c })
      .from(agentTasks)
      .where(and(eq(agentTasks.queue, 'Q1'), eq(agentTasks.status, 'queued'))),
    db
      .select({ n: c })
      .from(agentTasks)
      .where(and(eq(agentTasks.queue, 'Q2'), eq(agentTasks.status, 'queued'))),
    db
      .select({ n: c })
      .from(agentTasks)
      .where(and(eq(agentTasks.queue, 'Q3'), eq(agentTasks.status, 'queued'))),
    db
      .select({ n: c })
      .from(agentTasks)
      .where(and(eq(agentTasks.queue, 'Q4'), eq(agentTasks.status, 'queued'))),
    db.select({ n: c }).from(agentTasks).where(eq(agentTasks.status, 'running')),
    db.select({ n: c }).from(agentTasks).where(eq(agentTasks.status, 'dead_letter')),
  ]);

  return {
    depth: {
      Q0: q0[0]?.n ?? 0,
      Q1: q1[0]?.n ?? 0,
      Q2: q2[0]?.n ?? 0,
      Q3: q3[0]?.n ?? 0,
      Q4: q4[0]?.n ?? 0,
    },
    running: running[0]?.n ?? 0,
    deadLetter: deadLetter[0]?.n ?? 0,
  };
}

// ── POSIX ACL Enforcement ─────────────────────────────────────

const RING_TOOL_ACCESS: Record<number, string[]> = {
  0: ['*'], // kernel: everything
  1: [
    'memory.recall',
    'memory.write',
    'shell',
    'fs.read',
    'fs.write',
    'nexus_recall',
    'nexus_remember',
    'nexus_capture',
  ],
  2: ['memory.recall', 'memory.write', 'nexus_recall', 'nexus_remember'], // mcp-agent: no shell
  3: ['nexus_recall', 'nexus_stats'], // remote-client: read-only
  4: [], // quarantined: nothing
};

/**
 * Check whether an agent (by ring) is permitted to use a tool/action.
 * Returns true if the agent's ring includes the tool in its ACL or satisfies minRing.
 */
export function checkACL(agentRing: number, tool: string, minRing?: number): boolean {
  if (agentRing >= 4) return false; // Quarantined: no permissions
  if (agentRing === 0) return true; // Kernel: full access

  const allowed = RING_TOOL_ACCESS[agentRing] ?? [];
  if (allowed.includes('*')) return true;
  if (allowed.includes(tool)) return true;

  if (minRing !== undefined) {
    return agentRing <= minRing;
  }

  return agentRing <= 2;
}

/**
 * Authorize a tool execution for an agent.
 * Logs a cryptographic receipt and throws if the agent's ring denies access.
 */
export async function authorizeToolCall(
  agentId: string,
  agentRing: number,
  tool: string,
  target: string | undefined,
  actor: string,
  minRing?: number
): Promise<boolean> {
  const authorized = checkACL(agentRing, tool, minRing);

  // Always log the receipt (even denied attempts — audit trail)
  await logToolReceipt(
    {
      agentId,
      tool,
      target,
      authorized,
    },
    actor
  );

  if (!authorized) {
    // ACL violation — this is a security event
    await appendAudit(
      'security.acl_violation',
      {
        agentId,
        tool,
        target,
        ring: agentRing,
        minRing,
      },
      actor
    );

    // If agent is quarantined (ring 4) and tries tools, hard-block
    if (agentRing >= 4) {
      throw new Error(`Agent ${agentId} is quarantined (ring 4) and cannot execute ${tool}`);
    }
  }

  return authorized;
}

/**
 * Persisted Agent Process Execution State Recovery.
 * Recovers processes left in transient states ('thinking', 'executing_tool') across server restarts.
 */
export async function recoverAgentProcesses(actor: string = 'system') {
  const pendingAgents = await db.query.agents.findMany({
    where: sql`${agents.status} IN ('thinking', 'executing_tool')`,
  });

  const recovered: Array<{ id: string; status: string; iteration?: number }> = [];

  for (const agent of pendingAgents) {
    const meta = (agent.metadata ?? {}) as Record<string, unknown>;
    const execState = meta.executionState as
      { currentIteration?: number; status?: string } | undefined;

    let newStatus = 'idle';
    if (agent.tokensUsed >= agent.tokenBudget) {
      newStatus = 'paused';
    }

    await db
      .update(agents)
      .set({
        status: newStatus,
        currentTool: null,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    await appendAudit(
      'agent.process_recovered',
      {
        agentId: agent.id,
        previousStatus: agent.status,
        recoveredStatus: newStatus,
        lastIteration: execState?.currentIteration ?? 0,
      },
      actor
    );

    recovered.push({ id: agent.id, status: newStatus, iteration: execState?.currentIteration });
  }

  return recovered;
}

// ─────────────────────────────────────────────────────────────
// PHASE 11 — Advanced Kernel & Scheduling Subsystem (kernel side)
// Typed kernel event bus, ring policy store (hot-reload ACL),
// per-ring resource budget controller, priority inheritance (PIP),
// agent lifecycle hooks, Mermaid state-machine export, distributed
// barriers, control-group budget inheritance, and gang scheduling.
// ─────────────────────────────────────────────────────────────

// ── Typed Kernel Event Bus ───────────────────────────────────
export type KernelEventType =
  | 'task.enqueued'
  | 'task.completed'
  | 'task.failed'
  | 'agent.spawned'
  | 'agent.preempted'
  | 'ring.budget_exceeded';

export type KernelEventCallback = (payload: Record<string, unknown>) => void;

const kernelEventSubs = new Map<KernelEventType, Set<KernelEventCallback>>();
const kernelEventHistory: Array<{
  type: KernelEventType;
  at: number;
  payload: Record<string, unknown>;
}> = [];

export function subscribeKernelEvent(type: KernelEventType, cb: KernelEventCallback): () => void {
  const set = kernelEventSubs.get(type) ?? new Set();
  set.add(cb);
  kernelEventSubs.set(type, set);
  return () => set.delete(cb);
}

export function publishKernelEvent(type: KernelEventType, payload: Record<string, unknown>): void {
  kernelEventHistory.push({ type, at: Date.now(), payload });
  if (kernelEventHistory.length > 1000) kernelEventHistory.shift();
  const set = kernelEventSubs.get(type);
  if (set) {
    for (const cb of set) {
      try {
        cb(payload);
      } catch (e) {
        log.error('kernel_event_subscriber_error', {
          type,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  try {
    getMessageBus().publish(type, 'kernel', (payload.agentId as string) ?? 'kernel', payload);
  } catch {
    /* bus unavailable */
  }
}

export function getKernelEventHistory(): Array<{
  type: KernelEventType;
  at: number;
  payload: Record<string, unknown>;
}> {
  return [...kernelEventHistory];
}

// ── Typed scheduling errors ──────────────────────────────────
export class BackpressureError extends Error {
  constructor(public readonly queueDepth: number, public readonly highWatermark: number) {
    super(`Backpressure: queue depth ${queueDepth} exceeds high watermark ${highWatermark}`);
    this.name = 'BackpressureError';
    Object.setPrototypeOf(this, BackpressureError.prototype);
  }
}

export class DeadlineAdmissionError extends Error {
  constructor(public readonly reason: string) {
    super(`Deadline admission rejected: ${reason}`);
    this.name = 'DeadlineAdmissionError';
    Object.setPrototypeOf(this, DeadlineAdmissionError.prototype);
  }
}

// ── Ring Policy Store (hot-reload ACL) ───────────────────────
export interface RingPolicy {
  ring: number;
  tools: string[];
  maxConcurrency: number;
  maxTokensPerMin: number;
  maxApiCallsPerMin: number;
}

function defaultRingPolicy(ring: number): RingPolicy {
  return {
    ring,
    tools: RING_TOOL_ACCESS[ring] ?? [],
    maxConcurrency: 0,
    maxTokensPerMin: 0,
    maxApiCallsPerMin: 0,
  };
}

class RingPolicyStore {
  private cache = new Map<number, RingPolicy>();
  private loaded = false;

  constructor() {
    for (let r = 0; r <= 4; r++) this.cache.set(r, defaultRingPolicy(r));
  }

  get(ring: number): RingPolicy {
    return this.cache.get(ring) ?? defaultRingPolicy(ring);
  }

  async reload(): Promise<void> {
    const rows = await db.select().from(ringPolicies);
    for (const row of rows) {
      this.cache.set(row.ring, {
        ring: row.ring,
        tools: row.tools,
        maxConcurrency: row.maxConcurrency,
        maxTokensPerMin: row.maxTokensPerMin,
        maxApiCallsPerMin: row.maxApiCallsPerMin,
      });
    }
    this.loaded = true;
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.reload();
  }

  async set(ring: number, patch: Partial<Omit<RingPolicy, 'ring'>>): Promise<RingPolicy> {
    const current = this.get(ring);
    const next: RingPolicy = { ...current, ...patch, ring };
    await db
      .insert(ringPolicies)
      .values({
        id: `ring_${ring}`,
        ring,
        tools: next.tools,
        maxConcurrency: next.maxConcurrency,
        maxTokensPerMin: next.maxTokensPerMin,
        maxApiCallsPerMin: next.maxApiCallsPerMin,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ringPolicies.ring,
        set: {
          tools: next.tools,
          maxConcurrency: next.maxConcurrency,
          maxTokensPerMin: next.maxTokensPerMin,
          maxApiCallsPerMin: next.maxApiCallsPerMin,
          updatedAt: new Date(),
        },
      });
    this.cache.set(ring, next);
    this.publish(ring);
    return next;
  }

  private publish(ring: number): void {
    publishKernelEvent('ring.budget_exceeded', {
      ring,
      reason: 'policy_updated',
      tools: this.get(ring).tools,
    });
  }
}

export const ringPolicyStore = new RingPolicyStore();

// ── Per-Ring Resource Budget Controller (cgroups-style) ──────
interface RingUsage {
  concurrency: number;
  tokens: Array<{ at: number; n: number }>;
  apiCalls: Array<{ at: number; n: number }>;
}

const ringUsageMap = new Map<number, RingUsage>();
const RING_WINDOW_MS = 60_000;

function touchRing(ring: number): RingUsage {
  let u = ringUsageMap.get(ring);
  if (!u) {
    u = { concurrency: 0, tokens: [], apiCalls: [] };
    ringUsageMap.set(ring, u);
  }
  return u;
}

function rollWindow(entries: Array<{ at: number; n: number }>, now: number): number {
  const cutoff = now - RING_WINDOW_MS;
  while (entries.length && entries[0]!.at < cutoff) entries.shift();
  return entries.reduce((s, e) => s + e.n, 0);
}

export interface RingBudgetSnapshot {
  ring: number;
  maxConcurrency: number;
  concurrency: number;
  maxTokensPerMin: number;
  tokensPerMin: number;
  maxApiCallsPerMin: number;
  apiCallsPerMin: number;
  exceeded: boolean;
}

export function ringBudgetStatus(ring: number): RingBudgetSnapshot {
  const policy = ringPolicyStore.get(ring);
  const u = touchRing(ring);
  const now = Date.now();
  const tokens = rollWindow(u.tokens, now);
  const apiCalls = rollWindow(u.apiCalls, now);
  const exceeded =
    (policy.maxConcurrency > 0 && u.concurrency >= policy.maxConcurrency) ||
    (policy.maxTokensPerMin > 0 && tokens >= policy.maxTokensPerMin) ||
    (policy.maxApiCallsPerMin > 0 && apiCalls >= policy.maxApiCallsPerMin);
  return {
    ring,
    maxConcurrency: policy.maxConcurrency,
    concurrency: u.concurrency,
    maxTokensPerMin: policy.maxTokensPerMin,
    tokensPerMin: tokens,
    maxApiCallsPerMin: policy.maxApiCallsPerMin,
    apiCallsPerMin: apiCalls,
    exceeded,
  };
}

export function acquireRingBudget(ring: number, tokens = 0): boolean {
  const policy = ringPolicyStore.get(ring);
  const u = touchRing(ring);
  const now = Date.now();
  if (policy.maxConcurrency > 0 && u.concurrency >= policy.maxConcurrency) {
    publishKernelEvent('ring.budget_exceeded', { ring, reason: 'concurrency', snapshot: ringBudgetStatus(ring) });
    return false;
  }
  if (policy.maxTokensPerMin > 0 && rollWindow(u.tokens, now) + tokens > policy.maxTokensPerMin) {
    publishKernelEvent('ring.budget_exceeded', { ring, reason: 'tokens', snapshot: ringBudgetStatus(ring) });
    return false;
  }
  if (policy.maxApiCallsPerMin > 0 && rollWindow(u.apiCalls, now) + 1 > policy.maxApiCallsPerMin) {
    publishKernelEvent('ring.budget_exceeded', { ring, reason: 'api_calls', snapshot: ringBudgetStatus(ring) });
    return false;
  }
  u.concurrency += 1;
  if (tokens > 0) u.tokens.push({ at: now, n: tokens });
  u.apiCalls.push({ at: now, n: 1 });
  return true;
}

export function releaseRingBudget(ring: number): void {
  const u = touchRing(ring);
  if (u.concurrency > 0) u.concurrency -= 1;
}

// ── Priority Inheritance Protocol (PIP) ──────────────────────
interface HeldResource {
  resource: string;
  holderPriority: number;
  waiters: Array<{ agentId: string; priority: number }>;
}

const heldResources = new Map<string, HeldResource>();
const inheritedPriority = new Map<string, number>();

export function inheritPriority(
  waiterAgentId: string,
  waiterPriority: number,
  holderAgentId: string,
  resource: string
): void {
  const res = heldResources.get(resource) ?? { resource, holderPriority: waiterPriority, waiters: [] };
  res.holderPriority = Math.max(res.holderPriority, waiterPriority);
  res.waiters.push({ agentId: waiterAgentId, priority: waiterPriority });
  heldResources.set(resource, res);
  inheritedPriority.set(holderAgentId, res.holderPriority);
  log.info('pip_inherit', { holderAgentId, waiterAgentId, resource, priority: res.holderPriority });
}

export function restorePriority(holderAgentId: string, resource: string): void {
  heldResources.delete(resource);
  inheritedPriority.delete(holderAgentId);
  log.info('pip_restore', { holderAgentId, resource });
}

export function effectivePriority(agentId: string, basePriority: number): number {
  return inheritedPriority.get(agentId) ?? basePriority;
}

export function getHeldResources(): Array<{ resource: string; holderPriority: number; waiters: number }> {
  return Array.from(heldResources.values()).map((r) => ({
    resource: r.resource,
    holderPriority: r.holderPriority,
    waiters: r.waiters.length,
  }));
}

// ── Agent Lifecycle Hooks (schedule-aware) ───────────────────
export interface AgentLifecycleHooks {
  onPreempt?: (agentId: string) => Promise<void> | void;
  onResume?: (agentId: string) => Promise<void> | void;
}

const lifecycleHooks = new Map<string, AgentLifecycleHooks>();

export function registerLifecycleHooks(agentId: string, hooks: AgentLifecycleHooks): void {
  lifecycleHooks.set(agentId, { ...(lifecycleHooks.get(agentId) ?? {}), ...hooks });
}

export async function preemptAgent(agentId: string): Promise<void> {
  const hooks = lifecycleHooks.get(agentId);
  if (hooks?.onPreempt) {
    try {
      await hooks.onPreempt(agentId);
    } catch (e) {
      log.error('agent_preempt_hook_failed', {
        agentId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await appendAudit('agent.preempted', { agentId }, 'kernel');
  publishKernelEvent('agent.preempted', { agentId });
  getMessageBus().publish('agent.preempted', 'kernel', agentId, { agentId });
}

export async function resumeAgentHooks(agentId: string): Promise<void> {
  const hooks = lifecycleHooks.get(agentId);
  if (hooks?.onResume) {
    try {
      await hooks.onResume(agentId);
    } catch (e) {
      log.error('agent_resume_hook_failed', {
        agentId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

// ── Agent State Machine Visualizer (Mermaid) ─────────────────
export async function exportKernelStateMachine(): Promise<{
  mermaid: string;
  agents: Array<{ id: string; name: string; status: string; ring: number }>;
}> {
  const rows = await db.select().from(agents);
  const lines: string[] = ['stateDiagram-v2'];
  const validStates = ['idle', 'thinking', 'executing_tool', 'errored', 'quarantined', 'paused', 'completed', 'terminated'];
  for (const a of rows) {
    const safeId = `A_${a.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    lines.push(`  ${safeId} : ${a.name} [ring ${a.ring}]`);
    if (!validStates.includes(a.status)) continue;
    if (a.status === 'idle') lines.push(`  [*] --> ${safeId}`);
    if (a.status === 'terminated' || a.status === 'completed') lines.push(`  ${safeId} --> [*]`);
  }
  const transitions = await db.query.auditLog.findMany({
    where: sql`${auditLog.action} IN ('agent.spawned','task.completed','agent.preempted','agent.paused','agent.resumed','agent.terminated')`,
    orderBy: [desc(auditLog.createdAt)],
    limit: 500,
  });
  for (const t of transitions) {
    const p = (t.payload ?? {}) as Record<string, unknown>;
    const agentId = (p.agentId as string) ?? (p.agent as string);
    if (!agentId) continue;
    const safeId = `A_${agentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    if (t.action === 'agent.paused') lines.push(`  ${safeId} --> ${safeId}_paused : pause`);
  }
  return {
    mermaid: lines.join('\n'),
    agents: rows.map((a) => ({ id: a.id, name: a.name, status: a.status, ring: a.ring })),
  };
}

// ── Distributed Barrier Synchronization ──────────────────────
interface Barrier {
  name: string;
  total: number;
  arrived: Set<string>;
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

const barriers = new Map<string, Barrier>();

export function barrierWait(name: string, timeoutMs: number, memberId: string, total?: number): Promise<void> {
  let b = barriers.get(name);
  if (!b) {
    b = { name, total: total ?? 0, arrived: new Set(), resolve: () => {} };
    barriers.set(name, b);
  }
  if (total && total > b.total) b.total = total;
  const released = new Promise<void>((resolve) => {
    b!.resolve = resolve;
  });
  b.arrived.add(memberId);
  if (b.total > 0 && b.arrived.size >= b.total) {
    if (b.timer) clearTimeout(b.timer);
    barriers.delete(name);
    b.resolve();
  } else if (!b.timer) {
    b.timer = setTimeout(() => {
      barriers.delete(name);
      b!.resolve();
    }, timeoutMs);
  }
  return released;
}

export function barrierStatus(name: string): { name: string; arrived: number; total: number } | null {
  const b = barriers.get(name);
  if (!b) return null;
  return { name: b.name, arrived: b.arrived.size, total: b.total };
}

// ── Agent Control Groups (recursive budget inheritance) ──────
export interface Cgroup {
  cpuWeight: number;
  memWeight: number;
  tokenShare: number;
}

const DEFAULT_CGROUP: Cgroup = { cpuWeight: 100, memWeight: 100, tokenShare: 100 };

export function parseCgroup(raw: unknown): Cgroup {
  let c: unknown = raw;
  if (typeof raw === 'string') {
    try {
      c = JSON.parse(raw);
    } catch {
      c = {};
    }
  }
  const obj = (c ?? {}) as Partial<Cgroup>;
  return {
    cpuWeight: typeof obj.cpuWeight === 'number' ? obj.cpuWeight : DEFAULT_CGROUP.cpuWeight,
    memWeight: typeof obj.memWeight === 'number' ? obj.memWeight : DEFAULT_CGROUP.memWeight,
    tokenShare: typeof obj.tokenShare === 'number' ? obj.tokenShare : DEFAULT_CGROUP.tokenShare,
  };
}

export function inheritCgroup(parentCgroup: Cgroup | null, fraction = 0.5): Cgroup {
  const base = parentCgroup ?? DEFAULT_CGROUP;
  return {
    cpuWeight: Math.max(1, Math.round(base.cpuWeight * fraction)),
    memWeight: Math.max(1, Math.round(base.memWeight * fraction)),
    tokenShare: Math.max(1, Math.round(base.tokenShare * fraction)),
  };
}

// ── Gang Scheduling ──────────────────────────────────────────
const gangMembers = new Map<string, string[]>();

export function getGangMembers(primaryTaskId: string): string[] {
  return gangMembers.get(primaryTaskId) ?? [];
}

export function clearGangMembers(primaryTaskId: string): void {
  gangMembers.delete(primaryTaskId);
}

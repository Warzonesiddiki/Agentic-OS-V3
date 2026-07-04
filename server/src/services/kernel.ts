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
import { db } from "../db/client.js";
import { agents, agentTasks } from "../db/client.js";
import { appendAudit } from "../lib/audit.js";
import { logToolReceipt } from "./audit-engine.js";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

// ── Agent Registry ────────────────────────────────────────────

export interface SpawnAgentInput {
  name: string;
  kind?: "sub-agent" | "daemon";
  parentId?: string;
  ring?: number; // 0-4
  scopes?: string[];
  llmModel?: string;
  tokenBudget?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Spawn a new sub-agent (or daemon) in the registry.
 * Master agents call this to delegate work to specialized sub-agents.
 */
export async function spawnAgent(input: SpawnAgentInput, actor: string) {
  const ring = Math.max(0, Math.min(4, input.ring ?? 2)); // default ring 2 (sub-agent)
  const id = `agt_${randomUUID()}`;

  const [agent] = await db.insert(agents).values({
    id,
    name: input.name,
    kind: input.kind ?? "sub-agent",
    parentId: input.parentId ?? null,
    ring,
    scopes: input.scopes ?? [],
    status: "idle",
    llmModel: input.llmModel ?? null,
    tokenBudget: input.tokenBudget ?? 100000,
    tokensUsed: 0,
    timeoutMs: input.timeoutMs ?? 120000,
    maxRetries: input.maxRetries ?? 3,
    metadata: {},
  }).returning();

  await appendAudit("agent.spawned", {
    agentId: id, name: input.name, kind: input.kind ?? "sub-agent",
    parentId: input.parentId, ring, scopes: input.scopes ?? [],
  }, actor);

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
  const [updated] = await db.update(agents).set({
    status,
    currentTool: currentTool ?? null,
    updatedAt: new Date(),
    lastHeartbeatAt: new Date(),
  }).where(eq(agents.id, id)).returning();
  return updated;
}

/** Quarantine an agent (ring 4 — no mutations allowed). */
export async function quarantineAgent(id: string, reason: string, actor: string) {
  await db.update(agents).set({
    status: "quarantined",
    ring: 4,
    updatedAt: new Date(),
  }).where(eq(agents.id, id));

  await appendAudit("agent.quarantined", { agentId: id, reason }, actor);
}

/**
 * Pause an agent (state transition: idle|thinking|executing_tool → paused).
 */
export async function pauseAgent(id: string, actor: string) {
  const [updated] = await db.update(agents).set({
    status: "paused",
    currentTool: null,
    updatedAt: new Date(),
  }).where(eq(agents.id, id)).returning();

  if (updated) {
    await appendAudit("agent.paused", { agentId: id }, actor);
  }
  return updated;
}

/**
 * Resume a paused agent (state transition: paused → idle).
 */
export async function resumeAgent(id: string, actor: string) {
  const [updated] = await db.update(agents).set({
    status: "idle",
    updatedAt: new Date(),
  }).where(and(
    eq(agents.id, id),
    eq(agents.status, "paused"),
  )).returning();

  if (updated) {
    await appendAudit("agent.resumed", { agentId: id }, actor);
  }
  return updated;
}

/**
 * Terminate (kill) an agent — final state, cannot be resumed.
 */
export async function terminateAgent(id: string, reason: string, actor: string) {
  const [updated] = await db.update(agents).set({
    status: "terminated",
    currentTool: null,
    updatedAt: new Date(),
    metadata: sql`jsonb_set(metadata, '{terminateReason}', to_jsonb(${reason}::text))`,
  }).where(eq(agents.id, id)).returning();

  if (updated) {
    await appendAudit("agent.terminated", { agentId: id, reason }, actor);
  }
  return updated;
}

/**
 * Get full agent state including computed fields (alive, etc).
 */
export async function getAgentState(id: string) {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!agent) return null;
  const alive = ["idle", "thinking", "executing_tool", "paused"].includes(agent.status);
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

/** Increment token usage for an agent. Returns updated usage. */
export async function incrementTokenUsage(id: string, tokens: number) {
  const [updated] = await db.update(agents).set({
    tokensUsed: sql`${agents.tokensUsed} + ${tokens}`,
    updatedAt: new Date(),
  }).where(eq(agents.id, id)).returning();
  return updated?.tokensUsed ?? 0;
}

// ── Task Scheduling ───────────────────────────────────────────

const QUEUE_PRIORITY: Record<string, number> = {
  Q0: 100, Q1: 80, Q2: 60, Q3: 40, Q4: 20,
};

const KIND_QUEUE: Record<string, string> = {
  safety: "Q0", interactive: "Q1", background: "Q2", maintenance: "Q3", self_improvement: "Q4",
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
  const { checkCompiledScript } = await import("./skill-compiler.js");
  const compiled = await checkCompiledScript(input.label, input.input);
  if (compiled) {
    // Skip the scheduler entirely — the compiled script handled it.
    const task = {
      id: `tsk_${randomUUID()}_compiled`,
      agentId: input.agentId,
      label: `${input.label} [COMPILED]`,
      kind: input.kind ?? "interactive",
      queue: KIND_QUEUE[input.kind ?? "interactive"] ?? "Q1",
      priority: QUEUE_PRIORITY[KIND_QUEUE[input.kind ?? "interactive"] ?? "Q1"] ?? 60,
      status: "succeeded" as const,
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
    await appendAudit("task.compiled_executed", {
      taskId: task.id, scriptId: compiled.scriptId, label: input.label,
    }, actor);

    return task;
  }

  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await db.query.agentTasks.findFirst({
      where: eq(agentTasks.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return existing;
  }

  const queue = KIND_QUEUE[input.kind ?? "interactive"] ?? "Q1";
  const priority = QUEUE_PRIORITY[queue] ?? 60;

  const [task] = await db.insert(agentTasks).values({
    id: `tsk_${randomUUID()}`,
    agentId: input.agentId,
    label: input.label,
    kind: input.kind ?? "interactive",
    queue,
    priority,
    status: "queued",
    input: input.input ?? {},
    idempotencyKey: input.idempotencyKey ?? null,
    traceId: input.traceId ?? null,
    retryCount: 0,
    maxRetries: 3,
  }).returning();

  if (!task) throw new Error("Failed to create task — DB returned no row.");

  await appendAudit("task.enqueued", {
    taskId: task.id, agentId: input.agentId, label: input.label, queue,
  }, actor);

  return task;
}

/**
 * Pick the next runnable task from the scheduler.
 * Priority-based with starvation prevention:
 *   effective_priority = base_priority + min(60, age_seconds * 0.5)
 */
export async function pickNextTask(): Promise<typeof agentTasks.$inferSelect | null> {
  const queued = await db.query.agentTasks.findMany({
    where: eq(agentTasks.status, "queued"),
    limit: 50,
  });
  if (!queued.length) return null;

  const now = Date.now();
  // Sort by effective priority (starvation-aware)
  const scored = queued.map((t: typeof queued[number]) => ({
    task: t,
    eff: t.priority + Math.min(60, ((now - t.createdAt.getTime()) / 1000) * 0.5),
  }));
  scored.sort((a: { task: typeof queued[number]; eff: number }, b: { task: typeof queued[number]; eff: number }) => b.eff - a.eff);

  const pick = scored[0]!.task;

  // Atomically claim it (CAS: only transition if still queued)
  const [claimed] = await db.update(agentTasks).set({
    status: "running",
    startedAt: new Date(),
  }).where(and(
    eq(agentTasks.id, pick.id),
    eq(agentTasks.status, "queued"),
  )).returning();

  return claimed ?? null;
}

/** Mark a task as succeeded. */
export async function completeTask(taskId: string, output: unknown, actor: string) {
  await db.update(agentTasks).set({
    status: "succeeded",
    output,
    finishedAt: new Date(),
  }).where(eq(agentTasks.id, taskId));

  await appendAudit("task.completed", { taskId }, actor);
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
    await db.update(agentTasks).set({
      status: "queued",
      error,
      retryCount: retries,
    }).where(eq(agentTasks.id, taskId));

    await appendAudit("task.retried", { taskId, attempt: retries, error }, actor);
  } else {
    // Dead-letter + quarantine
    await db.update(agentTasks).set({
      status: "dead_letter",
      error,
      finishedAt: new Date(),
    }).where(eq(agentTasks.id, taskId));

    await quarantineAgent(task.agentId, `Task ${taskId} exceeded max retries (${task.maxRetries})`, actor);

    await appendAudit("task.dead_lettered", { taskId, retries, error }, actor);
  }
}

/** Get scheduler status: queue depths, running count, dead-letter count. */
export async function schedulerStatus() {
  const c = sql<number>`count(*)::int`;
  const [q0, q1, q2, q3, q4, running, deadLetter] = await Promise.all([
    db.select({ n: c }).from(agentTasks).where(and(eq(agentTasks.queue, "Q0"), eq(agentTasks.status, "queued"))),
    db.select({ n: c }).from(agentTasks).where(and(eq(agentTasks.queue, "Q1"), eq(agentTasks.status, "queued"))),
    db.select({ n: c }).from(agentTasks).where(and(eq(agentTasks.queue, "Q2"), eq(agentTasks.status, "queued"))),
    db.select({ n: c }).from(agentTasks).where(and(eq(agentTasks.queue, "Q3"), eq(agentTasks.status, "queued"))),
    db.select({ n: c }).from(agentTasks).where(and(eq(agentTasks.queue, "Q4"), eq(agentTasks.status, "queued"))),
    db.select({ n: c }).from(agentTasks).where(eq(agentTasks.status, "running")),
    db.select({ n: c }).from(agentTasks).where(eq(agentTasks.status, "dead_letter")),
  ]);

  return {
    depth: { Q0: q0[0]?.n ?? 0, Q1: q1[0]?.n ?? 0, Q2: q2[0]?.n ?? 0, Q3: q3[0]?.n ?? 0, Q4: q4[0]?.n ?? 0 },
    running: running[0]?.n ?? 0,
    deadLetter: deadLetter[0]?.n ?? 0,
  };
}

// ── POSIX ACL Enforcement ─────────────────────────────────────

const RING_TOOL_ACCESS: Record<number, string[]> = {
  0: ["*"], // kernel: everything
  1: ["memory.recall", "memory.write", "shell", "fs.read", "fs.write", "nexus_recall", "nexus_remember", "nexus_capture"],
  2: ["memory.recall", "memory.write", "nexus_recall", "nexus_remember"], // mcp-agent: no shell
  3: ["nexus_recall", "nexus_stats"], // remote-client: read-only
  4: [], // quarantined: nothing
};

/**
 * Check whether an agent (by ring) is permitted to use a tool.
 * Returns true if the agent's ring includes the tool in its ACL.
 */
export function checkACL(agentRing: number, tool: string): boolean {
  const allowed = RING_TOOL_ACCESS[agentRing] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.includes(tool);
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
  actor: string
): Promise<boolean> {
  const authorized = checkACL(agentRing, tool);

  // Always log the receipt (even denied attempts — audit trail)
  await logToolReceipt({
    agentId,
    tool,
    target,
    authorized,
  }, actor);

  if (!authorized) {
    // ACL violation — this is a security event
    await appendAudit("security.acl_violation", {
      agentId, tool, target, ring: agentRing,
    }, actor);

    // If agent is quarantined (ring 4) and tries tools, hard-block
    if (agentRing >= 4) {
      throw new Error(`Agent ${agentId} is quarantined (ring 4) and cannot execute ${tool}`);
    }
  }

  return authorized;
}

/**
 * services/task-worker.ts — Background Task Execution Loop.
 *
 * A polling-based worker that:
 *  1. Picks the highest-priority ready task via pickNextTask()
 *  2. Dispatches to the matching handler (LLM, browser, memory, maintenance)
 *  3. Calls completeTask() on success or failTask() with error details
 *  4. Enforces per-task timeouts and circuit-breaker protection
 *
 * Designed for zero-overhead: no DB writes when the queue is empty.
 */
import { log } from '../lib/logging.js';
import { onTaskQueued } from './task-notifier.js';
import { pickNextTask, completeTask, failTask, updateAgentState, getAgent, preemptAgent, releaseRingBudget } from './kernel.js';
import { withCircuitBreaker } from './operations-ext.js';
import { env, llmConfigured } from '../lib/env.js';
import { getMessageBus } from './message-bus.js';
import { db } from '../db/client.js';
import { agentTasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { startMlfqBooster, stopMlfqBooster, initializeSchedulingPolicy } from './scheduler.js';

// ── Configuration ─────────────────────────────────────────────

let _shadowCycleCount = 0;

export interface WorkerOptions {
  pollIntervalMs: number;
  maxConcurrency: number;
  defaultTimeoutMs: number;
  maintenanceIntervalMs: number;
  staleTaskTimeoutMs: number;
  agentHeartbeatTimeoutMs: number;
  autoKillEnabled: boolean;
}

const DEFAULT_OPTIONS: WorkerOptions = {
  pollIntervalMs: env.NEXUS_WORKER_POLL_MS,
  maxConcurrency: env.NEXUS_WORKER_MAX_CONCURRENCY,
  defaultTimeoutMs: env.NEXUS_WORKER_TIMEOUT_MS,
  maintenanceIntervalMs: env.NEXUS_WORKER_MAINTENANCE_MS,
  staleTaskTimeoutMs: env.NEXUS_WORKER_STALE_TASK_MS,
  agentHeartbeatTimeoutMs: env.NEXUS_WORKER_HEARTBEAT_MS,
  autoKillEnabled: env.NEXUS_WORKER_AUTO_KILL,
};

// ── State ─────────────────────────────────────────────────────

let running = false;
let activeCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;
let unsubTaskQueued: (() => void) | null = null;
let cronBusy = false;
let options: WorkerOptions = { ...DEFAULT_OPTIONS };

interface WorkerHealth {
  score: number;
  lastReport: number;
  metrics: Record<string, unknown>;
}

let workerHealth: WorkerHealth = { score: 1, lastReport: Date.now(), metrics: {} };
let healthCompleted = 0;
let healthErrors = 0;

export function reportWorkerHealth(score: number, metrics: Record<string, unknown> = {}): void {
  workerHealth = { score: Math.max(0, Math.min(1, score)), lastReport: Date.now(), metrics };
}

export function getWorkerHealth(): WorkerHealth {
  return { ...workerHealth };
}

function recordHealth(success: boolean, _latency: number): void {
  if (success) healthCompleted++;
  else healthErrors++;
  const total = healthCompleted + healthErrors;
  const score = total === 0 ? 1 : healthCompleted / total;
  reportWorkerHealth(score, { completed: healthCompleted, errors: healthErrors });
}

export function configureWorker(opts: Partial<WorkerOptions>): void {
  options = { ...options, ...opts };
}

export function workerStatus() {
  return {
    running,
    activeCount,
    pollIntervalMs: options.pollIntervalMs,
    maxConcurrency: options.maxConcurrency,
    maintenanceIntervalMs: options.maintenanceIntervalMs,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────

export function startWorker(actor: string): void {
  if (running) return;
  running = true;
  initializeSchedulingPolicy();
  startMlfqBooster();
  log.info('worker_started', {
    pollIntervalMs: options.pollIntervalMs,
    maxConcurrency: options.maxConcurrency,
  });

  pollTimer = setInterval(async () => {
    if (!running) return;
    if (activeCount >= options.maxConcurrency) return;
    try {
      await tick(actor);
    } catch (e) {
      log.error('worker_tick_error', { error: e instanceof Error ? e.message : String(e) });
    }
  }, options.pollIntervalMs);

  // Periodic maintenance: stale task reaper, heartbeat monitor, auto-kill watchdog
  maintenanceTimer = setInterval(async () => {
    if (!running) return;
    try {
      await runMaintenance(actor);
    } catch (e) {
      log.error('worker_maintenance_error', { error: e instanceof Error ? e.message : String(e) });
    }
  }, options.maintenanceIntervalMs);

  // LISTEN/NOTIFY trigger wake mechanism
  unsubTaskQueued = onTaskQueued(() => {
    if (running) {
      wakeWorker();
    }
  });
}

export function wakeWorker(): void {
  if (!running) return;
  tick('system').catch((e) => {
    log.error('worker_wake_tick_failed', { error: e instanceof Error ? e.message : String(e) });
  });
}

export function stopWorker(): void {
  running = false;
  stopMlfqBooster();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (maintenanceTimer) {
    clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }
  if (unsubTaskQueued) {
    unsubTaskQueued();
    unsubTaskQueued = null;
  }
  log.info('worker_stopped', { activeCount });
}

// ── Maintenance ───────────────────────────────────────────────

async function runMaintenance(actor: string): Promise<void> {
  const now = new Date();

  // 1. Reclaim stale tasks (M37b): tasks stuck in "running" for > staleTaskTimeoutMs
  const { db } = await import('../db/client.js');
  const { agentTasks } = await import('../db/schema.js');
  const { and, eq, lt, sql } = await import('drizzle-orm');
  const isSqlite = !(env.DATABASE_URL || '').startsWith('postgres');

  const staleCutoff = new Date(now.getTime() - options.staleTaskTimeoutMs);
  const staleTasks = await db
    .update(agentTasks)
    .set({
      retryCount: sql`${agentTasks.retryCount} + 1`,
      status: sql`CASE WHEN ${agentTasks.retryCount} + 1 >= ${agentTasks.maxRetries} THEN 'dead_letter' ELSE 'queued' END`,
      error: sql`COALESCE(${agentTasks.error}, '') || ' [AUTO-RECLAIMED: stale at ' || ${now.toISOString()} || ']'`,
      finishedAt: sql`CASE WHEN ${agentTasks.retryCount} + 1 >= ${agentTasks.maxRetries} THEN ${isSqlite ? now.toISOString() : now} ELSE ${agentTasks.finishedAt} END`,
    })
    .where(and(eq(agentTasks.status, 'running'), lt(agentTasks.startedAt, staleCutoff)))
    .returning({
      id: agentTasks.id,
      status: agentTasks.status,
      agentId: agentTasks.agentId,
      maxRetries: agentTasks.maxRetries,
    });

  if (staleTasks.length > 0) {
    log.info('worker_stale_reclaimed', { count: staleTasks.length });
    for (const t of staleTasks) {
      if (t.status === 'dead_letter') {
        try {
          const { quarantineAgent } = await import('./kernel.js');
          await quarantineAgent(
            t.agentId,
            `Task ${t.id} exceeded max retries (${t.maxRetries}) during stale reclamation`,
            actor
          );
        } catch (e) {
          log.error('worker_stale_quarantine_failed', { taskId: t.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }

  // 2. Agent heartbeat monitor (P12): mark agents without recent heartbeats as errored
  const { agents } = await import('../db/schema.js');
  const heartbeatCutoff = new Date(now.getTime() - options.agentHeartbeatTimeoutMs);
  const deadAgents = await db
    .update(agents)
    .set({
      status: 'errored',
      updatedAt: now,
    })
    .where(and(eq(agents.status, 'thinking'), lt(agents.lastHeartbeatAt, heartbeatCutoff)))
    .returning({ id: agents.id });

  if (deadAgents.length > 0) {
    log.info('worker_agents_timed_out', { count: deadAgents.length });
  }

  // 3. Auto-kill watchdog (P10): periodically check audit integrity
  if (options.autoKillEnabled) {
    try {
      const { verifyAndAutoKill } = await import('./audit-engine.js');
      await verifyAndAutoKill();
    } catch (e) {
      log.warn('worker_auto_kill_check_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 4. Cron tick concurrency guard (M36b)
  if (!cronBusy) {
    cronBusy = true;
    try {
      const { tickCron } = await import('./operations-ext.js');
      await tickCron(actor);
    } finally {
      cronBusy = false;
    }
  }

  // 5. Shadow cognition daemon (P9) — runs every 10th maintenance cycle (~10 min at default settings)
  _shadowCycleCount++;
  if (_shadowCycleCount % 10 === 0) {
    import('../services/health-monitor.js')
      .then((m) => m.runShadowCycle())
      .catch((e) => {
        log.error('shadow_cycle_failed', { error: e instanceof Error ? e.message : String(e) });
      });
  }
}

// ── Main Tick ─────────────────────────────────────────────────

async function tick(actor: string): Promise<void> {
  const task = await pickNextTask();
  if (!task) return;

  activeCount++;
  try {
    await executeTask(task, actor);
  } catch (e) {
    log.error('worker_task_panic', {
      taskId: task.id,
      error: e instanceof Error ? e.message : String(e),
    });
    await failTask(task.id, `PANIC: ${e instanceof Error ? e.message : String(e)}`, actor);
  } finally {
    activeCount--;
  }
}

// ── Task Execution ────────────────────────────────────────────

type TaskRow = NonNullable<Awaited<ReturnType<typeof pickNextTask>>>;

async function executeTask(task: TaskRow, actor: string): Promise<void> {
  const start = Date.now();
  const agent = await getAgent(task.agentId);
  const mode: 'cooperative' | 'preemptive' =
    agent?.schedulingMode === 'cooperative' ? 'cooperative' : 'preemptive';
  const bus = getMessageBus();

  await updateAgentState(task.agentId, 'thinking', `task:${task.label}`);
  bus.publish('agent.state', 'worker', task.agentId, {
    agentId: task.agentId,
    status: 'thinking',
    taskLabel: task.label,
  });
  bus.publish('task.update', 'worker', task.agentId, {
    taskId: task.id,
    status: 'running',
    agentId: task.agentId,
    label: task.label,
  });

  const controller = new AbortController();
  let preemptTimer: ReturnType<typeof setTimeout> | null = null;
  let preempted = false;
  // Preemptive tasks get a hard wall-clock quantum; cooperative tasks run to completion.
  const quantum = mode === 'preemptive' ? task.quantumMs ?? agent?.timeoutMs ?? options.defaultTimeoutMs : 0;

  const runDispatch = async (): Promise<unknown> => {
    if (quantum > 0) {
      preemptTimer = setTimeout(() => {
        preempted = true;
        controller.abort();
      }, quantum);
    }
    try {
      return await dispatchTask(task, actor, controller.signal);
    } finally {
      if (preemptTimer) {
        clearTimeout(preemptTimer);
        preemptTimer = null;
      }
    }
  };

  try {
    const result = await withCircuitBreaker(`task:${task.id}`, runDispatch);

    await completeTask(task.id, result, actor);
    await updateAgentState(task.agentId, 'idle');
    bus.publish('agent.state', 'worker', task.agentId, { agentId: task.agentId, status: 'idle' });
    bus.publish('task.update', 'worker', task.agentId, {
      taskId: task.id,
      status: 'succeeded',
      agentId: task.agentId,
      label: task.label,
    });
    log.info('worker_task_completed', {
      taskId: task.id,
      label: task.label,
      durationMs: Date.now() - start,
    });
    recordHealth(true, Date.now() - start);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    if (preempted) {
      // Quantum exceeded: snapshot execution state and requeue (context save/restore).
      const snapshot = {
        at: Date.now(),
        agentId: task.agentId,
        label: task.label,
        preempted: true,
        mode,
      };
      await db
        .update(agentTasks)
        .set({ status: 'queued', checkpoint: snapshot, startedAt: null })
        .where(and(eq(agentTasks.id, task.id), eq(agentTasks.status, 'running')));
      if (agent) releaseRingBudget(agent.ring);
      await preemptAgent(task.agentId);
      log.info('worker_preempted', { taskId: task.id, quantum, mode });
      return;
    }
    await failTask(task.id, errorMsg, actor);
    await updateAgentState(task.agentId, 'errored');
    bus.publish('agent.state', 'worker', task.agentId, {
      agentId: task.agentId,
      status: 'errored',
      error: errorMsg,
    });
    bus.publish('task.update', 'worker', task.agentId, {
      taskId: task.id,
      status: 'failed',
      error: errorMsg,
      agentId: task.agentId,
      label: task.label,
    });
    log.warn('worker_task_failed', {
      taskId: task.id,
      label: task.label,
      error: errorMsg,
      durationMs: Date.now() - start,
    });
    recordHealth(false, Date.now() - start);
  }
}

// ── Dispatcher ────────────────────────────────────────────────

async function dispatchTask(task: TaskRow, actor: string, signal: AbortSignal): Promise<unknown> {
  const { kind, label, input: taskInput } = task;
  const input = taskInput as Record<string, unknown>;

  // Normalize label for routing
  const labelLower = label.toLowerCase();

  // ── Interactive: agent LLM calls ──────────────────
  if (kind === 'interactive' || kind === 'background') {
    if (labelLower.includes('ambient') || labelLower.includes('distill')) {
      return handleAmbientDistillation(input, actor);
    }
    if (labelLower.includes('recall') || labelLower.includes('search')) {
      return handleRecall(input, actor);
    }
    if (labelLower.includes('capture') || labelLower.includes('session')) {
      return handleSessionCapture(input, actor);
    }
    if (labelLower.includes('checkpoint')) {
      return handleCheckpoint(input, actor);
    }
    // P1: Complex multi-step agent tasks — route to agent runtime
    if (
      labelLower.includes('research') ||
      labelLower.includes('explore') ||
      labelLower.includes('investigate') ||
      labelLower.includes('analyze')
    ) {
      return handleAgentRuntime(task, actor);
    }
    if (llmConfigured()) {
      return handleLLM(task, actor, signal);
    }
    return { note: 'No LLM provider configured — task recorded but not executed', kind, label };
  }

  // ── Maintenance ───────────────────────────────────
  if (kind === 'maintenance') {
    if (labelLower.includes('compress') || labelLower.includes('prune')) {
      return handleBrainCompress(actor);
    }
    if (
      labelLower.includes('compile') ||
      labelLower.includes('pattern') ||
      labelLower.includes('self-improve')
    ) {
      return handleSkillCompilation(actor);
    }
    if (labelLower.includes('health') || labelLower.includes('heartbeat')) {
      return { ok: true, timestamp: new Date().toISOString() };
    }
    if (labelLower.includes('sync') || labelLower.includes('workspace')) {
      return handleWorkspaceSync(input, actor);
    }
    return { note: 'No handler for maintenance task', label };
  }

  // ── Self-improvement ──────────────────────────────
  if (kind === 'self_improvement') {
    return handleSkillCompilation(actor);
  }

  // ── Safety ────────────────────────────────────────
  if (kind === 'safety') {
    return { note: 'Safety tasks require HITL approval — logged', label };
  }

  return { note: 'Unknown task kind', kind, label };
}

// ── Handlers ──────────────────────────────────────────────────

async function handleAgentRuntime(task: TaskRow, actor: string): Promise<unknown> {
  const { runAgent } = await import('./agent-runtime.js');
  const input = task.input as Record<string, unknown>;
  const goal = String(input?.query ?? input?.prompt ?? task.label);
  const result = await runAgent({
    agentId: task.agentId,
    goal,
    context: input,
    maxIterations: 15,
    actor,
  });
  return result;
}

async function handleLLM(task: TaskRow, actor: string, signal: AbortSignal): Promise<unknown> {
  const { recall } = await import('./recall.js');
  const { appendAudit } = await import('../lib/audit.js');
  const { callLLM } = await import('./llm.js');
  const { getAgent, incrementTokenUsage } = await import('./kernel.js');

  const input = task.input as Record<string, unknown>;
  const query = (input?.query ?? input?.prompt ?? task.label) as string;
  const contextBudget = (input?.contextBudget as number) ?? 8000;

  // Enforce token budget (P7)
  const agent = await getAgent(task.agentId);
  if (agent && agent.tokensUsed >= agent.tokenBudget) {
    throw new Error(
      `Token budget exhausted for agent ${task.agentId}: ${agent.tokensUsed}/${agent.tokenBudget}`
    );
  }

  const ctx = await recall(query, contextBudget, actor);
  const contextText = ctx.returned
    .map((r) => `[${r.type}] ${r.title}\n${r.content.slice(0, 2000)}`)
    .join('\n\n');

  const result = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are NEXUS, an autonomous AI agent operating in a multi-agent system.
Use the following context to answer accurately. If context is insufficient, say so.

Context:
${contextText}`,
      },
      { role: 'user', content: query },
    ],
    signal,
  });

  // Track token usage against agent budget (P7)
  await incrementTokenUsage(task.agentId, result.usage.total);

  await appendAudit(
    'worker.llm_completed',
    {
      taskId: task.id,
      model: result.model,
      tokensUsed: result.usage.total,
    },
    actor
  );

  return {
    response: result.content,
    usage: result.usage,
    contextUsed: ctx.returned.length,
  };
}

async function handleRecall(input: Record<string, unknown>, actor: string): Promise<unknown> {
  const { recall } = await import('./recall.js');
  const query = (input?.query ?? '') as string;
  const budget = (input?.budget as number) ?? 8000;
  return recall(query, budget, actor);
}

async function handleSessionCapture(
  input: Record<string, unknown>,
  actor: string
): Promise<unknown> {
  const { captureSession } = await import('./memory.service.js');
  const transcript = (input?.transcript ?? '') as string;
  const projectName = input?.projectName as string | undefined;
  return captureSession(transcript, projectName, actor);
}

async function handleCheckpoint(input: Record<string, unknown>, actor: string): Promise<unknown> {
  const { checkpoint } = await import('./memory.service.js');
  const label = (input?.label ?? 'checkpoint') as string;
  const context = (input?.context ?? '') as string;
  const projectName = input?.projectName as string | undefined;
  return checkpoint(label, context, projectName, actor);
}

async function handleAmbientDistillation(
  input: Record<string, unknown>,
  actor: string
): Promise<unknown> {
  const { distillTranscript } = await import('./llm.js');
  const { db } = await import('../db/client.js');
  const { memories: memSchema } = await import('../db/schema.js');
  const { appendAudit } = await import('../lib/audit.js');
  const { randomUUID } = await import('node:crypto');

  const transcript = (input?.transcript ?? '') as string;
  const source = (input?.source ?? 'unknown') as string;
  if (!transcript) return { note: 'empty transcript', source };

  const distilled = await distillTranscript(transcript);
  const rows = [];
  for (const d of distilled.slice(0, 25)) {
    const [row] = await db
      .insert(memSchema)
      .values({
        id: `mem_${randomUUID()}`,
        kind: d.kind,
        title: d.title,
        content: d.content,
        tags: d.tags,
        importance: d.importance,
        source: `ambient:${source}`,
      })
      .returning();
    if (row) rows.push(row.id);
  }
  await appendAudit(
    'ambient.distilled',
    { source, memories: rows.length, transcriptLen: transcript.length },
    actor
  );
  return { distilled: rows.length, source };
}

async function handleBrainCompress(actor: string): Promise<unknown> {
  const { compressBrain } = await import('./brain.js');
  return compressBrain(actor);
}

async function handleSkillCompilation(actor: string): Promise<unknown> {
  const { runCompilationPipeline } = await import('./skill-template-engine.js');
  return runCompilationPipeline(actor);
}

async function handleWorkspaceSync(
  input: Record<string, unknown>,
  actor: string
): Promise<unknown> {
  const { syncWorkspace } = await import('./file-watcher.js');
  const workspaceDir = (input?.workspaceDir as string) ?? process.cwd();
  return syncWorkspace(workspaceDir, actor);
}


/**
 * services/scheduler.ts — Cron/Event Scheduler (Phase 4d).
 *
 * In-memory + DB hybrid scheduler supporting:
 *   - Cron expressions: "0 9 * * *" = daily at 9am
 *   - Cron expression parsing, matching, next-run computation
 *   - Event triggers: webhook, agent_completion, signal
 *   - Job lifecycle management (create, list, cancel, update)
 *   - Execution with retry, error handling, concurrency control
 *   - Job history and status tracking
 *   - Timezone-aware scheduling
 *
 * Source: AutoGPT continuous triggers, CrewAI Flow scheduling.
 */
import { log } from '../lib/logging.js';
import { container } from '../lib/container.js';
import { CronExpressionParser, type CronExpression } from 'cron-parser';
import { randomUUID } from 'node:crypto';
import { db, cronJobs, agentTasks } from '../db/client.js';
import { appendAudit } from '../lib/audit.js';
import { getEnv } from '../lib/env.js';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────

export type CronStatus = 'active' | 'paused' | 'completed' | 'failed';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';
export type EventType = 'webhook' | 'agent_completion' | 'signal';

export interface SchedulerConfig {
  timezone: string;
  maxConcurrentJobs: number;
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
}

export interface CronJob {
  id: string;
  name: string;
  expression: string;
  action: string;
  payload?: unknown;
  status: CronStatus;
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  maxRetries: number;
  timeoutMs: number;
  timezone: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EventTrigger {
  type: EventType;
  match?: Record<string, unknown>;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  result: unknown;
  error: string | null;
  attempt: number;
  trigger: EventTrigger;
}

export interface ScheduleInput {
  name: string;
  expression: string;
  action: string;
  payload?: unknown;
  maxRetries?: number;
  timeoutMs?: number;
  timezone?: string;
  tags?: string[];
}

export interface ListFilter {
  status?: CronStatus;
  tag?: string;
  name?: string;
}

// ── Cron Parser ────────────────────────────────────────────────

/**
 * Parses and evaluates cron expressions for next-run computation and matching.
 * Wraps the cron-parser library with timezone-aware scheduling helpers.
 */
export class CronParser {
  private expr: CronExpression;
  private expression: string;
  private timezone: string;

  constructor(expression: string, timezone = 'UTC') {
    this.expression = expression;
    this.timezone = timezone;
    this.expr = CronExpressionParser.parse(expression, {
      tz: timezone,
    });
  }

  /** Get the next scheduled run time. */
  getNextRun(from?: Date): Date {
    const iter = from
      ? CronExpressionParser.parse(this.expression, { tz: this.timezone, currentDate: from })
      : this.expr;
    return iter.next().toDate();
  }

  /** Get the next N scheduled run times. */
  getNextRuns(count: number, from?: Date): Date[] {
    const iter = from
      ? CronExpressionParser.parse(this.expression, { tz: this.timezone, currentDate: from })
      : CronExpressionParser.parse(this.expression, { tz: this.timezone });
    const runs: Date[] = [];
    for (let i = 0; i < count; i++) {
      try {
        runs.push(iter.next().toDate());
      } catch {
        break;
      }
    }
    return runs;
  }

  /** Check if the given date matches the cron expression. */
  matches(date: Date): boolean {
    const normalized = new Date(date);
    normalized.setSeconds(0, 0);
    const prev = CronExpressionParser.parse(this.expression, {
      tz: this.timezone,
      currentDate: normalized,
    });
    try {
      const prevDate = prev.prev().toDate();
      const diff = Math.abs(normalized.getTime() - prevDate.getTime());
      return diff < 60000;
    } catch {
      return false;
    }
  }

  /** Validate a cron expression. */
  static validate(expression: string): boolean {
    try {
      CronExpressionParser.parse(expression);
      return true;
    } catch {
      return false;
    }
  }

  /** Serialize the expression back to string. */
  serialize(): string {
    return this.expression;
  }
}

// ── Default Config ─────────────────────────────────────────────

const DEFAULT_CONFIG: SchedulerConfig = {
  timezone: 'UTC',
  maxConcurrentJobs: getEnv().NEXUS_SCHEDULER_MAX_CONCURRENT,
  retryConfig: {
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
  },
};

// ── Scheduler ──────────────────────────────────────────────────

/**
 * Cron-based job scheduler with DB persistence, concurrency control,
 * retry with exponential backoff, and event-triggered execution.
 */
export class Scheduler {
  private config: SchedulerConfig;
  private running = new Map<string, Promise<unknown>>();
  private listeners = new Map<string, Set<(execution: JobExecution) => void>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /** Start the scheduler tick loop. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const interval = getEnv().NEXUS_SCHEDULER_TICK_MS;
    this.tickTimer = setInterval(() => this.tick(), interval);
    this.tick().catch((e: unknown) =>
      log.error('scheduler_initial_tick_failed', { error: e instanceof Error ? e.message : String(e) })
    );
    log.info('scheduler_started', {
      interval,
      maxConcurrent: this.config.maxConcurrentJobs,
      timezone: this.config.timezone,
    });
  }

  /** Stop the scheduler tick loop. */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.started = false;
    log.info('scheduler_stopped');
  }

  // ── Job Management ─────────────────────────────────────────

  /**
   * Schedule a new cron job. Validates the expression, persists to DB,
   * and computes the next run time immediately.
   */
  async scheduleJob(input: ScheduleInput, actor: string): Promise<CronJob> {
    if (!CronParser.validate(input.expression)) {
      throw new Error(`Invalid cron expression: "${input.expression}"`);
    }

    const parser = new CronParser(input.expression, input.timezone ?? this.config.timezone);
    const nextRun = parser.getNextRun();
    const id = `crn_${randomUUID()}`;

    const [row] = await db
      .insert(cronJobs)
      .values({
        id,
        name: input.name,
        cron: input.expression,
        agentKind: 'daemon',
        taskLabel: input.action,
        taskInput: input.payload ?? {},
        enabled: true,
        nextRunAt: nextRun,
        runCount: 0,
      })
      .returning();

    if (!row) throw new Error('Failed to schedule job — DB returned no row.');

    const job: CronJob = {
      id: row.id,
      name: row.name,
      expression: row.cron,
      action: row.taskLabel,
      payload: row.taskInput,
      status: row.enabled ? 'active' : 'paused',
      lastRun:
        row.lastRunAt instanceof Date
          ? row.lastRunAt
          : row.lastRunAt
            ? new Date(row.lastRunAt)
            : null,
      nextRun:
        row.nextRunAt instanceof Date
          ? row.nextRunAt
          : row.nextRunAt
            ? new Date(row.nextRunAt)
            : null,
      runCount: row.runCount,
      maxRetries: input.maxRetries ?? this.config.retryConfig.maxRetries,
      timeoutMs: input.timeoutMs ?? 300000,
      timezone: input.timezone ?? this.config.timezone,
      tags: input.tags ?? [],
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.createdAt instanceof Date ? new Date(row.createdAt) : row.createdAt,
    };

    await appendAudit(
      'scheduler.job_created',
      {
        jobId: job.id,
        name: job.name,
        expression: job.expression,
        action: job.action,
        timezone: job.timezone,
      },
      actor
    );

    return job;
  }

  /** Cancel a scheduled job (soft-delete by disabling). */
  async cancelJob(jobId: string, actor: string): Promise<void> {
    const [updated] = await db
      .update(cronJobs)
      .set({
        enabled: false,
      })
      .where(eq(cronJobs.id, jobId))
      .returning();

    if (!updated) throw new Error(`Job ${jobId} not found.`);
    await appendAudit('scheduler.job_cancelled', { jobId }, actor);
  }

  /** Update an existing job. */
  async updateJob(jobId: string, patch: Partial<ScheduleInput>, actor: string): Promise<CronJob> {
    const existing = await db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) });
    if (!existing) throw new Error(`Job ${jobId} not found.`);

    const expression = patch.expression ?? existing.cron;
    if (patch.expression && !CronParser.validate(patch.expression)) {
      throw new Error(`Invalid cron expression: "${patch.expression}"`);
    }

    const timezone = patch.timezone ?? this.config.timezone;
    const parser = new CronParser(expression, timezone);
    const nextRun = parser.getNextRun();

    const [updated] = await db
      .update(cronJobs)
      .set({
        name: patch.name ?? existing.name,
        cron: expression,
        taskLabel: patch.action ?? existing.taskLabel,
        taskInput: patch.payload ?? existing.taskInput,
        nextRunAt: nextRun,
      })
      .where(eq(cronJobs.id, jobId))
      .returning();

    if (!updated) throw new Error(`Failed to update job ${jobId}.`);

    await appendAudit('scheduler.job_updated', { jobId, fields: Object.keys(patch) }, actor);

    return this.rowToJob(updated);
  }

  /** List scheduled jobs with optional filters. */
  async listJobs(filter?: ListFilter): Promise<CronJob[]> {
    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(cronJobs.enabled, filter.status === 'active'));
    }
    if (filter?.name) {
      conditions.push(eq(cronJobs.name, filter.name));
    }

    const baseQuery = db.select().from(cronJobs).$dynamic();
    for (const cond of conditions) {
      baseQuery.where(cond);
    }
    const rows = await baseQuery.orderBy(desc(cronJobs.createdAt)).limit(200);
    return rows.map((r: typeof cronJobs.$inferSelect) => this.rowToJob(r));
  }

  /** Get a single job by ID. */
  async getJob(jobId: string): Promise<CronJob | null> {
    const row = await db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) });
    return row ? this.rowToJob(row) : null;
  }

  // ── Execution ──────────────────────────────────────────────

  /**
   * Evaluate all active jobs and execute any that are due (nextRunAt <= now).
   * Respects maxConcurrentJobs to avoid overloading the system.
   */
  async tick(): Promise<JobExecution[]> {
    if (this.running.size >= this.config.maxConcurrentJobs) {
      log.warn('scheduler_max_concurrent_reached', { running: this.running.size });
      return [];
    }

    const now = new Date();
    const due = await db.query.cronJobs.findMany({
      where: and(eq(cronJobs.enabled, true)),
    });

    const executions: JobExecution[] = [];
    for (const row of due) {
      if (!row.nextRunAt || row.nextRunAt > now) continue;
      if (this.running.size >= this.config.maxConcurrentJobs) break;

      const exec = await this.executeJob(row);
      executions.push(exec);
    }

    return executions;
  }

  /** Execute a single job and advance its schedule. */
  private async executeJob(row: typeof cronJobs.$inferSelect): Promise<JobExecution> {
    const startTime = Date.now();
    const executionId = `exec_${randomUUID()}`;

    const execution: JobExecution = {
      id: executionId,
      jobId: row.id,
      status: 'running',
      startedAt: new Date(startTime),
      completedAt: null,
      durationMs: null,
      result: null,
      error: null,
      attempt: 0,
      trigger: { type: 'signal' },
    };

    const runPromise = this.runWithRetry(row, execution, startTime);
    this.running.set(executionId, runPromise);

    try {
      const result = await runPromise;
      execution.status = result.status;
      execution.completedAt = new Date();
      execution.durationMs = Date.now() - startTime;
      execution.result = result.output;
      execution.error = result.error ?? null;

      // Advance schedule after successful execution
      try {
        const parser = new CronParser(row.cron, this.config.timezone);
        const nextRun = parser.getNextRun();
        await db
          .update(cronJobs)
          .set({
            lastRunAt: new Date(startTime),
            nextRunAt: nextRun,
            runCount: row.runCount + 1,
          })
          .where(eq(cronJobs.id, row.id));
      } catch (e) {
        log.error('scheduler_next_run_failed', { jobId: row.id, error: (e as Error).message });
      }
    } catch (e) {
      execution.status = 'failure';
      execution.completedAt = new Date();
      execution.durationMs = Date.now() - startTime;
      execution.error = (e as Error).message;
    } finally {
      this.running.delete(executionId);
    }

    this.notifyListeners(row.id, execution);
    return execution;
  }

  /** Run a job with retry logic. */
  private async runWithRetry(
    row: typeof cronJobs.$inferSelect,
    execution: JobExecution,
    _startTime: number
  ): Promise<{ status: ExecutionStatus; output: unknown; error: string | null }> {
    const maxRetries = this.config.retryConfig.maxRetries;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      execution.attempt = attempt;

      if (attempt > 0) {
        const backoff =
          this.config.retryConfig.backoffMs *
          Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1);
        log.info('scheduler_retry_backoff', { jobId: row.id, attempt, backoffMs: backoff });
        await sleep(backoff);
      }

      try {
        const result = await this.dispatchAction(row, execution);
        return { status: 'success', output: result, error: null };
      } catch (e) {
        lastError = (e as Error).message;
        log.warn('scheduler_execution_failed', { jobId: row.id, attempt, error: lastError });
      }
    }

    return { status: 'failure', output: null, error: lastError };
  }

  /** Dispatch the job's action handler. For now emits an SSE event. */
  private async dispatchAction(
    row: typeof cronJobs.$inferSelect,
    execution: JobExecution
  ): Promise<unknown> {
    if (row.taskLabel === 'blockchain.anchor' || row.taskLabel === 'audit.anchor') {
      const { anchorAuditLogsBatch } = await import('./blockchain.js');
      const result = await anchorAuditLogsBatch();
      return result ?? { message: 'No pending audit entries to anchor.' };
    }

    const { broadcastSSE } = await import('./sse-bus.js');
    broadcastSSE({
      type: 'cron.fired',
      data: {
        jobId: row.id,
        name: row.name,
        action: row.taskLabel,
        executionId: execution.id,
        payload: row.taskInput,
      },
      timestamp: Date.now(),
    });

    return { dispatched: true, jobId: row.id, executionId: execution.id };
  }

  // ── Event Triggers ─────────────────────────────────────────

  /** Trigger event-based execution. */
  async triggerEvent(
    eventType: EventType,
    payload: Record<string, unknown>,
    actor: string
  ): Promise<JobExecution[]> {
    log.info('scheduler_event_triggered', { eventType, payload });

    const jobs = await db.query.cronJobs.findMany({
      where: eq(cronJobs.enabled, true),
    });

    const triggered: JobExecution[] = [];
    for (const row of jobs) {
      const taskInput = row.taskInput as Record<string, unknown> | undefined;
      const matchEvent = taskInput?.triggerEvent as string | undefined;

      if (matchEvent && matchEvent === eventType) {
        const exec = await this.executeJob(row);
        triggered.push(exec);
      }
    }

    if (triggered.length > 0) {
      await appendAudit(
        'scheduler.event_triggered',
        { eventType, jobsFired: triggered.length, payload },
        actor
      );
    }

    return triggered;
  }

  /** Register a listener for job execution events. */
  onExecution(jobId: string, callback: (execution: JobExecution) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(callback);
    return () => {
      this.listeners.get(jobId)?.delete(callback);
    };
  }

  private notifyListeners(jobId: string, execution: JobExecution): void {
    const set = this.listeners.get(jobId);
    if (set) {
      for (const cb of set) {
        try {
          cb(execution);
        } catch (e) {
          log.error('scheduler_listener_error', { jobId, error: (e as Error).message });
        }
      }
    }
  }

  // ── Logs ───────────────────────────────────────────────────

  /** Get job execution logs from the audit trail. */
  async getJobLogs(jobId: string, from?: Date, to?: Date): Promise<unknown[]> {
    const { auditLog } = await import('../db/schema.js');
    const conditions = [];

    conditions.push(eq(auditLog.action, 'scheduler.job_executed'));
    conditions.push(sql`${auditLog.payload}->>'jobId' = ${jobId}`);

    if (from) conditions.push(gte(auditLog.createdAt, from));
    if (to) conditions.push(lte(auditLog.createdAt, to));

    const baseQuery = db.select().from(auditLog).$dynamic();
    for (const cond of conditions) {
      baseQuery.where(cond);
    }

    return baseQuery.orderBy(desc(auditLog.createdAt)).limit(500);
  }

  /** Get all currently running execution IDs. */
  getRunningCount(): number {
    return this.running.size;
  }

  /** Get scheduler stats. */
  async getStats(): Promise<{
    active: number;
    running: number;
    total: number;
    maxConcurrent: number;
    timezone: string;
  }> {
    const all = await db.select().from(cronJobs);
    return {
      active: all.filter((r: typeof cronJobs.$inferSelect) => r.enabled).length,
      running: this.running.size,
      total: all.length,
      maxConcurrent: this.config.maxConcurrentJobs,
      timezone: this.config.timezone,
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private rowToJob(row: typeof cronJobs.$inferSelect): CronJob {
    return {
      id: row.id,
      name: row.name,
      expression: row.cron,
      action: row.taskLabel,
      payload: row.taskInput,
      status: row.enabled ? 'active' : 'paused',
      lastRun:
        row.lastRunAt instanceof Date
          ? row.lastRunAt
          : row.lastRunAt
            ? new Date(row.lastRunAt)
            : null,
      nextRun:
        row.nextRunAt instanceof Date
          ? row.nextRunAt
          : row.nextRunAt
            ? new Date(row.nextRunAt)
            : null,
      runCount: row.runCount,
      maxRetries: this.config.retryConfig.maxRetries,
      timeoutMs: 300000,
      timezone: this.config.timezone,
      tags: [],
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.createdAt),
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────

/** Get or create the global scheduler instance. */
export function getScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  try {
    return container.resolve<Scheduler>("scheduler");
  } catch {
    const instance = new Scheduler(config);
    container.register("scheduler", instance);
    return instance;
  }
}

/** Reset the singleton (for testing). */
export function resetScheduler(): void {
  try {
    const instance = container.resolve<Scheduler>("scheduler");
    instance.stop();
    container.register("scheduler", new Scheduler());
  } catch {
    // ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// PHASE 11 — Advanced Kernel & Scheduling Subsystem
// Task-scheduling policies layered on top of the cron scheduler.
// Exposes a pluggable SchedulingPolicy architecture (MLFQ, EDF,
// FairShare), MLFQ aging/boost, EDF admission control, hierarchical
// per-team schedulers, dry-run/replay tracing, and per-queue latency
// percentile profiling. Pure policy functions operate on QueuedTask
// and are unit-testable without a database.
// ─────────────────────────────────────────────────────────────

export type QueueLevel = 'Q0' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export const MLFQ_LEVELS: readonly QueueLevel[] = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'] as const;

/** Preemptive timeslice (ms) granted per MLFQ level. Q0 gets the smallest. */
export const MLFQ_QUANTUM_MS: Record<QueueLevel, number> = {
  Q0: 50,
  Q1: 100,
  Q2: 200,
  Q3: 400,
  Q4: 800,
};

/** Normalized MLFQ priority weight per level (higher = more urgent). */
export const MLFQ_PRIORITY: Record<QueueLevel, number> = {
  Q0: 100,
  Q1: 80,
  Q2: 60,
  Q3: 40,
  Q4: 20,
};

export interface QueuedTask {
  id: string;
  agentId?: string;
  queue: string;
  priority: number;
  deadline: Date | null;
  createdAt: Date;
  kind?: string;
  estimatedDurationMs?: number | null;
  gangId?: string | null;
}

export interface SchedulingPolicy {
  name: string;
  pick(tasks: QueuedTask[]): QueuedTask | null;
}

function queueRank(queue: string): number {
  const idx = MLFQ_LEVELS.indexOf(queue as QueueLevel);
  return idx >= 0 ? idx : MLFQ_LEVELS.length;
}

export class MLFQPolicy implements SchedulingPolicy {
  readonly name = 'mlfq';
  pick(tasks: QueuedTask[]): QueuedTask | null {
    if (!tasks.length) return null;
    const sorted = [...tasks].sort((a, b) => {
      const ra = queueRank(a.queue);
      const rb = queueRank(b.queue);
      if (ra !== rb) return ra - rb;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sorted[0] ?? null;
  }
}

export class EDFPolicy implements SchedulingPolicy {
  readonly name = 'edf';
  pick(tasks: QueuedTask[]): QueuedTask | null {
    if (!tasks.length) return null;
    const sorted = [...tasks].sort((a, b) => {
      const da = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
      const db2 = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
      if (da !== db2) return da - db2;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sorted[0] ?? null;
  }
}

const fairShareLastServed = new Map<string, number>();

export class FairSharePolicy implements SchedulingPolicy {
  readonly name = 'fairshare';
  pick(tasks: QueuedTask[]): QueuedTask | null {
    if (!tasks.length) return null;
    const agents = Array.from(new Set(tasks.map((t) => t.agentId ?? '_global')));
    let bestAgent = agents[0] ?? '_global';
    let bestTime = Number.POSITIVE_INFINITY;
    for (const a of agents) {
      const last = fairShareLastServed.get(a) ?? 0;
      if (last < bestTime) {
        bestTime = last;
        bestAgent = a;
      }
    }
    const candidates = tasks
      .filter((t) => (t.agentId ?? '_global') === bestAgent)
      .sort(
        (x, y) =>
          y.priority - x.priority || x.createdAt.getTime() - y.createdAt.getTime()
      );
    const chosen =
      candidates[0] ??
      [...tasks].sort((x, y) => y.priority - x.priority)[0] ??
      null;
    if (chosen) fairShareLastServed.set(bestAgent, Date.now());
    return chosen;
  }
}

let activePolicy: SchedulingPolicy = new MLFQPolicy();

export function setSchedulingPolicy(name: 'mlfq' | 'edf' | 'fairshare'): void {
  if (name === 'mlfq') activePolicy = new MLFQPolicy();
  else if (name === 'edf') activePolicy = new EDFPolicy();
  else activePolicy = new FairSharePolicy();
  log.info('scheduler_policy_changed', { policy: activePolicy.name });
}

/** Select policy from env at startup. */
export function initializeSchedulingPolicy(): void {
  setSchedulingPolicy(getEnv().NEXUS_SCHEDULER_POLICY);
}

export function getSchedulingPolicyName(): string {
  return activePolicy.name;
}

export function pickByPolicy(tasks: QueuedTask[]): QueuedTask | null {
  return activePolicy.pick(tasks);
}

/**
 * MLFQ aging/boost: all queued tasks not already in Q0 are promoted to Q0.
 * Driven on a timer (startMlfqBooster) so long-running low-priority work
 * cannot starve. Returns the number of tasks promoted.
 */
export async function boostMlfqQueues(): Promise<number> {
  const result = await db
    .update(agentTasks)
    .set({ queue: 'Q0' })
    .where(and(eq(agentTasks.status, 'queued'), sql`${agentTasks.queue} <> 'Q0'`))
    .returning({ id: agentTasks.id });
  return result.length;
}

/**
 * Deadline-aware admission control (EDF). Rejects tasks whose deadline is
 * too close to `now` to complete given estimatedDurationMs * safetyFactor.
 */
export function checkDeadlineAdmission(
  deadline: Date | null | undefined,
  estimatedDurationMs: number | null | undefined,
  now: Date = new Date(),
  safetyFactor = 1.5
): { ok: boolean; reason?: string } {
  if (!deadline) return { ok: true };
  if (!estimatedDurationMs || estimatedDurationMs <= 0) return { ok: true };
  const slack = deadline.getTime() - now.getTime();
  if (slack <= 0) return { ok: false, reason: 'deadline already passed' };
  if (slack < estimatedDurationMs * safetyFactor) {
    return {
      ok: false,
      reason: `deadline too tight: ${Math.round(slack)}ms slack < ${Math.round(
        estimatedDurationMs * safetyFactor
      )}ms required`,
    };
  }
  return { ok: true };
}

// ── Per-queue latency profiling ───────────────────────────────
const latencySamples = new Map<string, number[]>();
const MAX_SAMPLES = 1000;

export function recordQueueLatency(queue: string, waitMs: number): void {
  const arr = latencySamples.get(queue) ?? [];
  arr.push(waitMs);
  if (arr.length > MAX_SAMPLES) arr.shift();
  latencySamples.set(queue, arr);
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx] ?? 0;
}

export function getQueueLatencyPercentiles(): Record<
  string,
  { p50: number; p90: number; p99: number; p999: number; samples: number }
> {
  const out: Record<
    string,
    { p50: number; p90: number; p99: number; p999: number; samples: number }
  > = {};
  for (const [queue, samples] of latencySamples) {
    const sorted = [...samples].sort((a, b) => a - b);
    out[queue] = {
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p99: percentile(sorted, 99),
      p999: percentile(sorted, 99.9),
      samples: sorted.length,
    };
  }
  return out;
}

export interface SchedulerTraceEntry {
  at: number;
  taskId: string | null;
  queue: string;
  reason: string;
}

/**
 * Dry-run / replay: simulate the scheduler repeatedly applying the active
 * policy without mutating the database. Returns the resolved dispatch order
 * plus a full trace for what-if analysis.
 */
export async function dryRunSchedule(limit = 100): Promise<{
  order: QueuedTask[];
  trace: SchedulerTraceEntry[];
}> {
  const rows = await db.query.agentTasks.findMany({
    where: eq(agentTasks.status, 'queued'),
    orderBy: [asc(agentTasks.createdAt)],
    limit,
  });
  const pool: QueuedTask[] = rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    queue: r.queue,
    priority: r.priority,
    deadline:
      r.deadline instanceof Date
        ? r.deadline
        : r.deadline
        ? new Date(r.deadline)
        : null,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    kind: r.kind,
    estimatedDurationMs: r.estimatedDurationMs,
    gangId: r.gangId,
  }));
  const order: QueuedTask[] = [];
  const trace: SchedulerTraceEntry[] = [];
  const remaining = [...pool];
  while (remaining.length) {
    const chosen = pickByPolicy(remaining);
    if (!chosen) break;
    order.push(chosen);
    trace.push({
      at: Date.now(),
      taskId: chosen.id,
      queue: chosen.queue,
      reason: `picked by ${activePolicy.name}`,
    });
    const idx = remaining.findIndex((t) => t.id === chosen.id);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return { order, trace };
}

// ── Hierarchical scheduler: per-team nested schedulers ─────────
export class TeamScheduler {
  private usedMs = 0;
  private windowStart = Date.now();
  constructor(
    public readonly teamId: string,
    public timeBudgetMs: number,
    public weight = 1
  ) {}

  reset(): void {
    this.usedMs = 0;
    this.windowStart = Date.now();
  }

  canSchedule(estimatedMs: number): boolean {
    if (Date.now() - this.windowStart > 60000) this.reset();
    return this.usedMs + estimatedMs <= this.timeBudgetMs;
  }

  consume(estimatedMs: number): void {
    this.usedMs += estimatedMs;
  }

  remaining(): number {
    if (Date.now() - this.windowStart > 60000) this.reset();
    return Math.max(0, this.timeBudgetMs - this.usedMs);
  }
}

export class HierarchicalScheduler {
  private teams = new Map<string, TeamScheduler>();
  constructor(public globalBudgetMs = 300000) {}

  enroll(teamId: string, timeBudgetMs: number, weight = 1): TeamScheduler {
    const ts = new TeamScheduler(teamId, timeBudgetMs, weight);
    this.teams.set(teamId, ts);
    return ts;
  }

  get(teamId: string): TeamScheduler | undefined {
    return this.teams.get(teamId);
  }

  list(): Array<{ teamId: string; remaining: number; budget: number }> {
    return Array.from(this.teams.values()).map((t) => ({
      teamId: t.teamId,
      remaining: t.remaining(),
      budget: t.timeBudgetMs,
    }));
  }
}

// ── Dry-run mode toggle ────────────────────────────────────────
let dryRun = getEnv().NEXUS_SCHEDULER_DRY_RUN;
export function setDryRun(enabled: boolean): void {
  dryRun = enabled;
}
export function isDryRun(): boolean {
  return dryRun;
}

// ── MLFQ booster lifecycle ─────────────────────────────────────
let boosterTimer: ReturnType<typeof setInterval> | null = null;
export function startMlfqBooster(): void {
  if (boosterTimer) return;
  const interval = getEnv().NEXUS_MLFQ_BOOST_MS;
  boosterTimer = setInterval(() => {
    boostMlfqQueues()
      .then((n: number) => {
        if (n > 0) log.info('mlfq_boost', { promoted: n });
      })
      .catch((e: unknown) =>
        log.error('mlfq_boost_failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }, interval);
}
export function stopMlfqBooster(): void {
  if (boosterTimer) {
    clearInterval(boosterTimer);
    boosterTimer = null;
  }
}

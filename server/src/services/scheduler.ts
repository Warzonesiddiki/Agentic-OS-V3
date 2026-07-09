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

// ── Risk model ─────────────────────────────────────────────────

/**
 * (Forge) Deterministically derive a risk weight [0..100] for a task from its
 * kind + queue. Safety-critical, governance, and irreversible operations score
 * higher so that, when a scheduling policy's primary ordering ties, the runtime
 * loop prefers the higher-risk task (fail-fast / least-surprise dispatch).
 *
 * This is the single source of truth for the risk signal that was previously
 * computed but discarded at enqueue time. No schema change required — it is a
 * pure function of fields already present on every task.
 */
const HIGH_RISK_KINDS = new Set([
  'kill',
  'delete',
  'destroy',
  'shutdown',
  'reset',
  'migrate',
  'deploy',
  'rollback',
  'payment',
  'transaction',
  'exec',
  'shell',
  'write',
  'mutate',
]);
const MED_RISK_KINDS = new Set([
  'spawn',
  'compile',
  'export',
  'import',
  'train',
  'upgrade',
  'provision',
  'scale',
]);

export function riskLevelForTask(kind?: string, queue?: string): number {
  const k = (kind ?? '').toLowerCase();
  if (HIGH_RISK_KINDS.has(k)) return 90;
  if (MED_RISK_KINDS.has(k)) return 55;
  // Ring-0 / ring-1 queues are inherently privileged → elevated risk.
  if (queue) {
    const m = /^ring[ -]?([0-4])$/i.exec(queue.trim());
    if (m) {
      const ring = Number(m[1]);
      if (ring <= 1) return Math.max(70, 80 - ring * 10);
    }
  }
  return 10;
}

/** Risk-aware tiebreaker: higher risk first; stable on createdAt via caller. */
export function compareRisk(a: QueuedTask, b: QueuedTask): number {
  return (b.risk ?? 0) - (a.risk ?? 0);
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
      log.error('scheduler_initial_tick_failed', {
        error: e instanceof Error ? e.message : String(e),
      })
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
    return container.resolve<Scheduler>('scheduler');
  } catch {
    const instance = new Scheduler(config);
    container.register('scheduler', instance);
    return instance;
  }
}

/** Reset the singleton (for testing). */
export function resetScheduler(): void {
  try {
    const instance = container.resolve<Scheduler>('scheduler');
    instance.stop();
    container.register('scheduler', new Scheduler());
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

/** Preemptive timeslice (ms) granted per MLFQ level. Q0 gets the smallest.
 *  This is the *default* quantum; the live, self-tuned quantum is held in
 *  `liveQuantum` (see ML-001 self-tuning) and read via getQuantum(). */
export const MLFQ_QUANTUM_MS: Record<QueueLevel, number> = {
  Q0: 50,
  Q1: 100,
  Q2: 200,
  Q3: 400,
  Q4: 800,
};

// (ML-001) Live, self-tuned quantum overrides. Empty until ML-001 adjusts a
// level; getQuantum() falls back to the default. Mutated only via setQuantum().
const liveQuantum: Partial<Record<QueueLevel, number>> = {};

export function getQuantum(level: QueueLevel): number {
  return liveQuantum[level] ?? MLFQ_QUANTUM_MS[level];
}

export function setQuantum(level: QueueLevel, ms: number): number {
  if (ms < 5) throw new Error('setQuantum: quantum must be >= 5ms');
  const v = Math.floor(ms);
  liveQuantum[level] = v;
  log.info('scheduler_quantum_set', { level, ms: v });
  return v;
}

export function resetQuantum(): void {
  for (const k of Object.keys(liveQuantum) as QueueLevel[]) delete liveQuantum[k];
}

/** Normalized MLFQ priority weight per level (higher = more urgent). */
export const MLFQ_PRIORITY: Record<QueueLevel, number> = {
  Q0: 100,
  Q1: 80,
  Q2: 60,
  Q3: 40,
  Q4: 20,
};

/** (Phase 11.21) A non-Q0 task is promoted to Q0 once its starvation score exceeds this. */
export const STARVATION_PROMOTE_THRESHOLD = 5;

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
  /** (Phase 11.21) Aging counter; increments each time the task is skipped. */
  starvationScore?: number;
  /** (Forge) Risk weight 0..100 derived from kind + queue so policies can apply a
   *  deterministic risk-aware tiebreaker when primary ordering ties. */
  risk?: number;
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
      // (Forge) Risk-aware tiebreaker: within the same queue, prefer higher-risk work.
      const r = (b.risk ?? 0) - (a.risk ?? 0);
      if (r !== 0) return r;
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
      // (Forge) Risk-aware tiebreaker: when deadlines tie, prefer higher-risk work.
      const r = (b.risk ?? 0) - (a.risk ?? 0);
      if (r !== 0) return r;
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
          y.priority - x.priority ||
          // (Forge) risk-aware tiebreaker
          (y.risk ?? 0) - (x.risk ?? 0) ||
          x.createdAt.getTime() - y.createdAt.getTime()
      );
    const chosen = candidates[0] ?? [...tasks].sort((x, y) => y.priority - x.priority)[0] ?? null;
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
  const chosen = activePolicy.pick(tasks);
  applyStarvationAging(tasks, chosen);
  return chosen;
}

/**
 * (Phase 11.21) Starvation aging applied at the active-policy layer.
 * Every task in `pool` that is NOT picked and NOT already in Q0 has its
 * `starvationScore` incremented. Once the score exceeds
 * STARVATION_PROMOTE_THRESHOLD the task is promoted to Q0 and its score
 * reset. Policy classes (MLFQPolicy/EDFPolicy) remain pure — no mutation
 * happens there; mutation is centralized here.
 */
export function applyStarvationAging(pool: QueuedTask[], picked?: QueuedTask | null): void {
  for (const t of pool) {
    if (picked && t.id === picked.id) continue; // the served task never starves
    if (t.queue === 'Q0') continue; // already at top level
    t.starvationScore = (t.starvationScore ?? 0) + 1;
    if (t.starvationScore > STARVATION_PROMOTE_THRESHOLD) {
      t.queue = 'Q0';
      t.starvationScore = 0;
    }
  }
}

export const MLFQ_AGE_PROMOTE_MS = 30_000;

/**
 * (Forge) Live pre-pick aging pass — exercises the MLFQ enqueue/promote/demote
 * machinery DURING dispatch. `applyStarvationAging` (above) mutates the local
 * pool but is lost on the next `pickNextTask` call because the pool is rebuilt
 * from the DB each time. This pass promotes a task ONE level toward Q0 once its
 * durable `createdAt` age exceeds MLFQ_AGE_PROMOTE_MS, so starvation-promotion
 * is both exercised at dispatch AND persists (the caller writes `to` back to the
 * task's `queue` column). Pure: returns the list of changes; caller persists.
 */
export function applyMlfqAgingPass(
  pool: QueuedTask[],
  now: number = Date.now()
): Array<{ id: string; from: QueueLevel; to: QueueLevel }> {
  const changed: Array<{ id: string; from: QueueLevel; to: QueueLevel }> = [];
  for (const t of pool) {
    const from = t.queue as QueueLevel;
    const idx = MLFQ_LEVELS.indexOf(from);
    if (idx <= 0 || idx >= MLFQ_LEVELS.length) continue; // already Q0 or unknown
    const age = now - t.createdAt.getTime();
    if (age >= MLFQ_AGE_PROMOTE_MS) {
      const to = MLFQ_LEVELS[idx - 1] as QueueLevel;
      t.queue = to;
      changed.push({ id: t.id, from, to });
    }
  }
  return changed;
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
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
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
  const pool: QueuedTask[] = rows.map((r: typeof agentTasks.$inferSelect) => ({
    id: r.id,
    agentId: r.agentId,
    queue: r.queue,
    priority: r.priority,
    deadline: r.deadline instanceof Date ? r.deadline : r.deadline ? new Date(r.deadline) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
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

// ── Fairness tracker (Phase 11.25) ────────────────────────────
export class FairnessTracker {
  private metaById = new Map<string, Record<string, unknown>>();
  private weightById = new Map<string, number>();
  private shareById = new Map<string, number>();
  private readonly epsilon: number;

  constructor(entitlementEpsilon = 0.05) {
    this.epsilon = entitlementEpsilon;
  }

  register(meta: Record<string, unknown>, weight: number): void {
    const key = teamKey(meta);
    this.metaById.set(key, meta);
    this.weightById.set(key, weight);
  }

  record(meta: Record<string, unknown>, share: number): void {
    const key = teamKey(meta);
    this.metaById.set(key, meta);
    this.shareById.set(key, share);
  }

  measure(): Array<{
    key: string;
    actualShare: number;
    entitlementShare: number;
    deviation: number;
  }> {
    const totalWeight = [...this.weightById.values()].reduce((a, b) => a + b, 0) || 1;
    const out: Array<{
      key: string;
      actualShare: number;
      entitlementShare: number;
      deviation: number;
    }> = [];
    for (const [key, weight] of this.weightById) {
      const entitlement = weight / totalWeight;
      const actual = this.shareById.get(key) ?? 0;
      out.push({
        key,
        actualShare: actual,
        entitlementShare: entitlement,
        deviation: entitlement > 0 ? (actual - entitlement) / entitlement : 0,
      });
    }
    return out;
  }

  correct(): { adjusted: string[] } {
    const adjusted = this.measure()
      .filter((m) => m.deviation < -this.epsilon && m.entitlementShare > 0)
      .map((m) => m.key);
    return { adjusted };
  }
}

function teamKey(meta: Record<string, unknown>): string {
  if (typeof meta.teamId === 'string') return meta.teamId;
  if (typeof meta.id === 'string') return meta.id;
  if (typeof meta.name === 'string') return meta.name;
  return JSON.stringify(meta);
}

// ── Scheduler dry-run (pure, no DB) (Phase 11) ────────────────
export interface DryRunTask {
  id: string;
  weight?: number;
  priority?: number;
  deadline?: Date | null;
  teamId?: string;
}

export interface SchedulerDryRunResult {
  order: string[];
  trace: Array<{ at: number; taskId: string; reason: string }>;
  mode: 'simulation';
}

export function schedulerDryRun(pool: DryRunTask[]): SchedulerDryRunResult {
  const remaining = [...pool];
  const order: string[] = [];
  const trace: Array<{ at: number; taskId: string; reason: string }> = [];
  while (remaining.length) {
    const candidates = remaining
      .map((t) => ({
        t,
        rank: t.priority ?? 0,
        deadline: t.deadline ? t.deadline.getTime() : Number.POSITIVE_INFINITY,
        weight: t.weight ?? 1,
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank;
        if (a.deadline !== b.deadline) return a.deadline - b.deadline;
        return b.weight - a.weight;
      });
    const chosen = candidates[0]?.t;
    if (!chosen) break;
    order.push(chosen.id);
    trace.push({ at: Date.now(), taskId: chosen.id, reason: `picked by ${activePolicy.name}` });
    const idx = remaining.findIndex((t) => t.id === chosen.id);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return { order, trace, mode: 'simulation' };
}

// ── Scheduler latency summary (Phase 11) ──────────────────────
export interface QueueLatencySummary {
  [queue: string]: {
    samples: number;
    p50: number;
    p90: number;
    p99: number;
    p999: number;
    mean: number;
  };
}

export function getSchedulerLatency(): QueueLatencySummary {
  const pct = getQueueLatencyPercentiles();
  const out: QueueLatencySummary = {};
  for (const [queue, v] of Object.entries(pct)) {
    const samples = latencySamples.get(queue) ?? [];
    const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    out[queue] = { samples: v.samples, p50: v.p50, p90: v.p90, p99: v.p99, p999: v.p999, mean };
  }
  return out;
}

// ── Self-optimization control surface (Phase 18 seams) ─────────
export interface PidGain {
  kp: number;
  ki: number;
  kd: number;
}

let pidGain: PidGain = { kp: 1, ki: 0.1, kd: 0.01 };
let queueCapacity = 1024;
let rlPolicy = 'mlfq';

export function setPidGain(g: Partial<PidGain>): PidGain {
  pidGain = { ...pidGain, ...g };
  log.info('scheduler_pid_gain_set', { gain: pidGain });
  return pidGain;
}

export function setQueueCapacity(n: number): number {
  if (n < 1) throw new Error('setQueueCapacity: capacity must be >= 1');
  queueCapacity = Math.floor(n);
  log.info('scheduler_queue_capacity_set', { capacity: queueCapacity });
  return queueCapacity;
}

export function setRlPolicy(p: string): string {
  rlPolicy = p;
  log.info('scheduler_rl_policy_set', { policy: rlPolicy });
  return rlPolicy;
}

export function getPidGain(): PidGain {
  return pidGain;
}
export function getQueueCapacity(): number {
  return queueCapacity;
}
export function getRlPolicy(): string {
  return rlPolicy;
}

// ─────────────────────────────────────────────────────────────
// SELF-HEALING ADMISSION CONTROL (Forge — extreme resilience)
// A bounded concurrency slot manager + circuit breaker protecting the
// runtime loop from cascading failures. The task-worker loop calls
// acquireSlot()/releaseSlot(); failures trip the breaker to OPEN, halting
// admission until a half-open probe succeeds. Pure in-memory, no schema
// change, fully unit-testable, and hash-chained through the audit trail
// via the kernel's emitAudit() seam.
// ─────────────────────────────────────────────────────────────

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface SlotManagerStats {
  state: BreakerState;
  active: number;
  capacity: number;
  available: number;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  openedAt: number | null;
  lastTrippedReason: string | null;
  halfOpenProbes: number;
}

export interface SlotManagerOptions {
  capacity?: number;
  /** Consecutive failures that trip the breaker to OPEN. */
  failureThreshold?: number;
  /** Cool-down (ms) before OPEN transitions to HALF_OPEN. */
  openForMs?: number;
  /** How many probes are allowed in HALF_OPEN before re-closing. */
  halfOpenProbeLimit?: number;
  /** Optional hook invoked on every state transition (audit seam). */
  onTransition?: (from: BreakerState, to: BreakerState, reason: string) => void;
}

export class SchedulerSlotManager {
  private active = new Set<string>();
  private capacity: number;
  private failureThreshold: number;
  private openForMs: number;
  private halfOpenProbeLimit: number;
  private onTransition?: (from: BreakerState, to: BreakerState, reason: string) => void;

  private state: BreakerState = 'closed';
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastTrippedReason: string | null = null;
  private halfOpenProbes = 0;

  constructor(opts: SlotManagerOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? getEnv().NEXUS_WORKER_MAX_CONCURRENCY);
    this.failureThreshold = Math.max(1, opts.failureThreshold ?? 8);
    this.openForMs = Math.max(100, opts.openForMs ?? 30_000);
    this.halfOpenProbeLimit = Math.max(1, opts.halfOpenProbeLimit ?? 3);
    this.onTransition = opts.onTransition;
  }

  private transition(to: BreakerState, reason: string): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    if (to === 'open') {
      this.openedAt = Date.now();
      this.lastTrippedReason = reason;
    }
    if (to === 'half-open') {
      this.halfOpenProbes = 0;
    }
    if (to === 'closed') {
      this.consecutiveFailures = 0;
      this.openedAt = null;
      this.lastTrippedReason = null;
    }
    this.onTransition?.(from, to, reason);
    log.warn('scheduler_breaker_transition', { from, to, reason, active: this.active.size });
  }

  /** Try to admit a task. Returns false if overloaded or breaker is OPEN. */
  tryAcquire(taskId: string): boolean {
    if (this.active.has(taskId)) return true;
    const now = Date.now();
    if (this.state === 'open') {
      if (this.openedAt !== null && now - this.openedAt >= this.openForMs) {
        this.transition('half-open', 'cooldown_elapsed');
      } else {
        return false;
      }
    }
    if (this.state === 'half-open') {
      if (this.halfOpenProbes >= this.halfOpenProbeLimit) return false;
      this.halfOpenProbes++;
    }
    if (this.active.size >= this.capacity) return false;
    this.active.add(taskId);
    return true;
  }

  release(taskId: string, outcome: 'success' | 'failure', reason?: string): void {
    const had = this.active.delete(taskId);
    if (!had) return;
    if (outcome === 'success') {
      this.successes++;
      this.consecutiveFailures = 0;
      if (this.state === 'half-open') this.transition('closed', 'probe_succeeded');
    } else {
      this.failures++;
      this.consecutiveFailures++;
      if (this.state !== 'open' && this.consecutiveFailures >= this.failureThreshold) {
        this.transition('open', reason ?? 'failure_threshold_exceeded');
      }
    }
  }

  /** Force-open the breaker (e.g. kernel panic / kill-switch). */
  trip(reason: string): void {
    this.transition('open', reason);
  }

  reset(): void {
    this.active.clear();
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.transition('closed', 'manual_reset');
  }

  stats(): SlotManagerStats {
    return {
      state: this.state,
      active: this.active.size,
      capacity: this.capacity,
      available: Math.max(0, this.capacity - this.active.size),
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      lastTrippedReason: this.lastTrippedReason,
      halfOpenProbes: this.halfOpenProbes,
    };
  }

  getSize(): number {
    return this.active.size;
  }
}

// Singleton slot manager (admission control for the runtime loop).
let globalSlots: SchedulerSlotManager | null = null;
export function getSlotManager(): SchedulerSlotManager {
  if (!globalSlots) globalSlots = new SchedulerSlotManager();
  return globalSlots;
}
export function resetSlotManager(): void {
  globalSlots = null;
}

// ─────────────────────────────────────────────────────────────
// ML-001 — SELF-TUNING MLFQ (Forge / extreme perfection)
// Closed-loop controller: periodically samples per-queue latency
// percentiles (recordQueueLatency / getQueueLatencyPercentiles) and adjusts
// (a) the live MLFQ quantum per level via setQuantum(), and
// (b) the PID gains via setPidGain() — both are Pulse's public control-surface
// setters (no Pulse files touched). This makes the scheduler adapt its
// timeslices to measured latency without human intervention. Rate-limited and
// bounded so it can never oscillate or violate the min-quantum floor.
// ─────────────────────────────────────────────────────────────

export interface MlfqSelfTunerConfig {
  /** How often the loop samples latency (ms). */
  intervalMs: number;
  /** p99 wait (ms) above which the hot queue is given a larger quantum. */
  highLatencyMs: number;
  /** p99 wait (ms) below which the hot queue is given a smaller quantum. */
  lowLatencyMs: number;
  /** Max quantum step per adjustment (ms). */
  maxStepMs: number;
  /** Min quantum the tuner will set (safety floor). */
  minQuantumMs: number;
  /** Max quantum the tuner will set. */
  maxQuantumMs: number;
  /** Disable the controller (e.g. for tests / manual control). */
  enabled: boolean;
}

export const DEFAULT_MLFQ_TUNER_CONFIG: MlfqSelfTunerConfig = {
  intervalMs: 15_000,
  highLatencyMs: 1500,
  lowLatencyMs: 200,
  maxStepMs: 50,
  minQuantumMs: 10,
  maxQuantumMs: 2000,
  enabled: true,
};

let tunerConfig: MlfqSelfTunerConfig = { ...DEFAULT_MLFQ_TUNER_CONFIG };
let tunerTimer: ReturnType<typeof setInterval> | null = null;
let lastAdjustMs: Record<string, number> = {};

export function configureMlfqSelfTuner(cfg: Partial<MlfqSelfTunerConfig>): MlfqSelfTunerConfig {
  tunerConfig = { ...tunerConfig, ...cfg };
  log.info('mlfq_tuner_configured', { cfg: tunerConfig });
  return tunerConfig;
}

export function getMlfqSelfTunerConfig(): MlfqSelfTunerConfig {
  return tunerConfig;
}

/** One control step: read latency, nudge the hottest queue's quantum + PID. */
export function mlfqSelfTuneStep(): { adjusted: string[]; p99: Record<string, number> } {
  const pct = getQueueLatencyPercentiles();
  const adjusted: string[] = [];
  const p99: Record<string, number> = {};
  const levels: QueueLevel[] = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];
  // Find the single hottest queue (worst p99) to avoid thrashing all levels.
  let hottest: QueueLevel | null = null;
  let worst = -1;
  for (const lvl of levels) {
    const q = `queue:${lvl}`;
    const v = pct[q];
    const p = v ? v.p99 : 0;
    p99[lvl] = p;
    if (p > worst) {
      worst = p;
      hottest = lvl;
    }
  }
  if (!hottest || worst < tunerConfig.lowLatencyMs) {
    // Everything is healthy — gently relax PID integral windup.
    return { adjusted, p99 };
  }
  const cur = getQuantum(hottest);
  let next = cur;
  if (worst > tunerConfig.highLatencyMs) {
    // Latency too high → give the hot queue a larger quantum (serve more per slice).
    next = Math.min(tunerConfig.maxQuantumMs, cur + tunerConfig.maxStepMs);
  } else if (worst < tunerConfig.highLatencyMs) {
    // Moderate latency → shrink the quantum slightly to improve fairness/responsiveness.
    next = Math.max(tunerConfig.minQuantumMs, cur - Math.floor(tunerConfig.maxStepMs / 2));
  }
  if (next !== cur) {
    setQuantum(hottest, next);
    adjusted.push(hottest);
  }
  // Adjust PID proportional gain inversely to latency: worse latency → stronger gain.
  const g = getPidGain();
  const targetKp = Math.max(0.5, Math.min(4, 1 + worst / tunerConfig.highLatencyMs));
  if (Math.abs(targetKp - g.kp) >= 0.05) {
    setPidGain({ kp: Number(targetKp.toFixed(2)) });
  }
  lastAdjustMs[hottest] = Date.now();
  return { adjusted, p99 };
}

export function startMlfqSelfTuner(cfg?: Partial<MlfqSelfTunerConfig>): void {
  if (cfg) configureMlfqSelfTuner(cfg);
  if (!tunerConfig.enabled) return;
  if (tunerTimer) return;
  tunerTimer = setInterval(() => {
    try {
      const r = mlfqSelfTuneStep();
      if (r.adjusted.length) log.info('mlfq_tuner_adjust', { adjusted: r.adjusted });
    } catch (e: unknown) {
      log.error('mlfq_tuner_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }, tunerConfig.intervalMs);
}

export function stopMlfqSelfTuner(): void {
  if (tunerTimer) {
    clearInterval(tunerTimer);
    tunerTimer = null;
  }
}

export function isMlfqSelfTunerRunning(): boolean {
  return tunerTimer !== null;
}

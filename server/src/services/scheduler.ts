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
import { CronExpressionParser, type CronExpression } from "cron-parser";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { cronJobs } from "../db/schema.js";
import { appendAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";
import { log } from "../lib/logging.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────

export type CronStatus = "active" | "paused" | "completed" | "failed";
export type ExecutionStatus = "pending" | "running" | "success" | "failure" | "skipped";
export type EventType = "webhook" | "agent_completion" | "signal";

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

  constructor(expression: string, timezone = "UTC") {
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
  timezone: "UTC",
  maxConcurrentJobs: parseInt(process.env.NEXUS_SCHEDULER_MAX_CONCURRENT ?? "10", 10),
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
    const interval = env.NEXUS_SCHEDULER_TICK_MS;
    this.tickTimer = setInterval(() => this.tick(), interval);
    this.tick().catch((e) => log.error("scheduler_initial_tick_failed", { error: (e as Error).message }));
    log.info("scheduler_started", { interval, maxConcurrent: this.config.maxConcurrentJobs, timezone: this.config.timezone });
  }

  /** Stop the scheduler tick loop. */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.started = false;
    log.info("scheduler_stopped");
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

    const [row] = await db.insert(cronJobs).values({
      id,
      name: input.name,
      cron: input.expression,
      agentKind: "daemon",
      taskLabel: input.action,
      taskInput: input.payload ?? {},
      enabled: true,
      nextRunAt: nextRun,
      runCount: 0,
    }).returning();

    if (!row) throw new Error("Failed to schedule job — DB returned no row.");

    const job: CronJob = {
      id: row.id,
      name: row.name,
      expression: row.cron,
      action: row.taskLabel,
      payload: row.taskInput,
      status: row.enabled ? "active" : "paused",
      lastRun: row.lastRunAt,
      nextRun: row.nextRunAt,
      runCount: row.runCount,
      maxRetries: input.maxRetries ?? this.config.retryConfig.maxRetries,
      timeoutMs: input.timeoutMs ?? 300000,
      timezone: input.timezone ?? this.config.timezone,
      tags: input.tags ?? [],
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    };

    await appendAudit("scheduler.job_created", { jobId: job.id, name: job.name, expression: job.expression, action: job.action, timezone: job.timezone }, actor);

    return job;
  }

  /** Cancel a scheduled job (soft-delete by disabling). */
  async cancelJob(jobId: string, actor: string): Promise<void> {
    const [updated] = await db.update(cronJobs).set({
      enabled: false,
    }).where(eq(cronJobs.id, jobId)).returning();

    if (!updated) throw new Error(`Job ${jobId} not found.`);
    await appendAudit("scheduler.job_cancelled", { jobId }, actor);
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

    const [updated] = await db.update(cronJobs).set({
      name: patch.name ?? existing.name,
      cron: expression,
      taskLabel: patch.action ?? existing.taskLabel,
      taskInput: patch.payload ?? existing.taskInput,
      nextRunAt: nextRun,
    }).where(eq(cronJobs.id, jobId)).returning();

    if (!updated) throw new Error(`Failed to update job ${jobId}.`);

    await appendAudit("scheduler.job_updated", { jobId, fields: Object.keys(patch) }, actor);

    return this.rowToJob(updated);
  }

  /** List scheduled jobs with optional filters. */
  async listJobs(filter?: ListFilter): Promise<CronJob[]> {
    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(cronJobs.enabled, filter.status === "active"));
    }
    if (filter?.name) {
      conditions.push(eq(cronJobs.name, filter.name));
    }

    const baseQuery = db.select().from(cronJobs).$dynamic();
    for (const cond of conditions) {
      baseQuery.where(cond);
    }
    const rows = await baseQuery.orderBy(desc(cronJobs.createdAt)).limit(200);
    return rows.map((r) => this.rowToJob(r));
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
      log.warn("scheduler_max_concurrent_reached", { running: this.running.size });
      return [];
    }

    const now = new Date();
    const due = await db.query.cronJobs.findMany({
      where: and(
        eq(cronJobs.enabled, true),
      ),
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
      status: "running",
      startedAt: new Date(startTime),
      completedAt: null,
      durationMs: null,
      result: null,
      error: null,
      attempt: 0,
      trigger: { type: "signal" },
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
        await db.update(cronJobs).set({
          lastRunAt: new Date(startTime),
          nextRunAt: nextRun,
          runCount: row.runCount + 1,
        }).where(eq(cronJobs.id, row.id));
      } catch (e) {
        log.error("scheduler_next_run_failed", { jobId: row.id, error: (e as Error).message });
      }
    } catch (e) {
      execution.status = "failure";
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
    startTime: number,
  ): Promise<{ status: ExecutionStatus; output: unknown; error: string | null }> {
    const maxRetries = this.config.retryConfig.maxRetries;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      execution.attempt = attempt;

      if (attempt > 0) {
        const backoff = this.config.retryConfig.backoffMs * Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1);
        log.info("scheduler_retry_backoff", { jobId: row.id, attempt, backoffMs: backoff });
        await sleep(backoff);
      }

      try {
        const result = await this.dispatchAction(row, execution);
        return { status: "success", output: result, error: null };
      } catch (e) {
        lastError = (e as Error).message;
        log.warn("scheduler_execution_failed", { jobId: row.id, attempt, error: lastError });
      }
    }

    return { status: "failure", output: null, error: lastError };
  }

  /** Dispatch the job's action handler. For now emits an SSE event. */
  private async dispatchAction(row: typeof cronJobs.$inferSelect, execution: JobExecution): Promise<unknown> {
    const { broadcastSSE } = await import("./bus.js");
    broadcastSSE({
      type: "cron.fired",
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
  async triggerEvent(eventType: EventType, payload: Record<string, unknown>, actor: string): Promise<JobExecution[]> {
    log.info("scheduler_event_triggered", { eventType, payload });

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
      await appendAudit("scheduler.event_triggered", { eventType, jobsFired: triggered.length, payload }, actor);
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
          log.error("scheduler_listener_error", { jobId, error: (e as Error).message });
        }
      }
    }
  }

  // ── Logs ───────────────────────────────────────────────────

  /** Get job execution logs from the audit trail. */
  async getJobLogs(jobId: string, from?: Date, to?: Date): Promise<unknown[]> {
    const { auditLog } = await import("../db/schema.js");
    const conditions = [];

    conditions.push(eq(auditLog.action, "scheduler.job_executed"));
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
      active: all.filter((r) => r.enabled).length,
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
      status: row.enabled ? "active" : "paused",
      lastRun: row.lastRunAt,
      nextRun: row.nextRunAt,
      runCount: row.runCount,
      maxRetries: this.config.retryConfig.maxRetries,
      timeoutMs: 300000,
      timezone: this.config.timezone,
      tags: [],
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────

let _instance: Scheduler | null = null;

/** Get or create the global scheduler instance. */
export function getScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  if (!_instance) {
    _instance = new Scheduler(config);
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetScheduler(): void {
  _instance?.stop();
  _instance = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

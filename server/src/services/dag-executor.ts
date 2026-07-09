/**
 * dag-executor.ts — Phase 13 (Multi-Agent Orchestration)
 *
 * Executes a `RunPlan` (produced by `planner.ts`) as a dependency-respecting
 * DAG. Each step is run by the bound agent capability via `runAgent`, with:
 *  - topological scheduling driven by `step.dependsOn`
 *  - bounded retries (`step.maxRetries`)
 *  - compensation on failure for `compensatable` steps
 *  - blackboard handoff (`step.writes` / `step.reads`)
 *  - periodic deadlock detection (`detectDeadlock`)
 *  - result merging for fan-in steps (`mergeBy`)
 *
 * The executor is pure orchestration glue — it does NOT re-implement agent
 * execution; it delegates to `runAgent` and the kernel's `enqueueTask` seam
 * for durable task ingestion where appropriate.
 */
import { randomId } from '../lib/id.js';
import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';
import { runAgent, type AgentConfig } from './agent-runtime.js';
import { blackboard } from './blackboard.js';
import { detectDeadlock } from './deadlock-detector.js';
import { mergeBy } from './merge-strategies.js';
import type { RunPlan, PlanStep } from './planner.js';

/** Outcome of a single executed step. */
export interface StepResult {
  stepId: string;
  ok: boolean;
  output: unknown;
  error?: string;
  attempts: number;
  startedAt: number;
  finishedAt: number;
}

/** Final run result. */
export interface RunResult {
  planId: string;
  runId: string;
  ok: boolean;
  steps: StepResult[];
  /** Aggregated blackboard snapshot at completion. */
  board: Record<string, unknown>;
  /** Compensation outcomes keyed by stepId. `true` = rolled back, `false` =
   *  compensation failed (audit-trailed for operators). Absent = step either
   *  completed or was not compensatable. */
  compensation?: Record<string, boolean>;
  startedAt: number;
  finishedAt: number;
}

/** Execution options. */
export interface ExecutorOptions {
  /** Abort signal. */
  signal?: AbortSignal;
  /** Called after each step completes. */
  onStep?: (r: StepResult) => void;
  /** Max parallel in-flight steps (default 4). */
  maxConcurrency?: number;
  /** Per-step soft timeout in ms (default 60_000). A timed-out step counts
   *  as a failure and is retried; it never blocks the whole run. */
  stepTimeoutMs?: number;
  /** Called when a compensatable step is rolled back, so callers can verify
   *  the compensation actually happened (real self-healing, not just an audit
   *  line). Returning false marks compensation as failed and is logged. */
  onCompensate?: (step: PlanStep, runId: string) => Promise<boolean> | boolean;
  /** Base backoff (ms) for retries (default 300). Actual delay uses
   *  exponential jitter: base * 2^(attempt-1) ± 25%. */
  retryBaseMs?: number;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_BASE_MS = 300;

/**
 * Wraps a promise with a soft timeout. On timeout the inner promise is NOT
 * cancelled at the agent level (it may still complete and write to the
 * blackboard later), but the step itself fails fast so the executor can retry
 * or compensate without a hung step blocking the whole run.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, stepId: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`step ${stepId} exceeded soft timeout of ${ms}ms`)),
      ms
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Deterministic-ish jittered exponential backoff: base * 2^(attempt-1) ± 25%. */
function backoffMs(base: number, attempt: number): number {
  const exp = base * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = exp * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.max(50, Math.round(exp + jitter));
}

async function runStep(
  plan: RunPlan,
  step: PlanStep,
  runId: string,
  inputs: Record<string, unknown>,
  opts: ExecutorOptions
): Promise<StepResult> {
  const startedAt = Date.now();
  const maxRetries = step.maxRetries ?? 2;
  const timeoutMs = opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const baseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  let attempts = 0;
  let lastErr: string | undefined;
  let output: unknown = undefined;

  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      if (step.reads) {
        for (const k of step.reads) {
          if (k in inputs)
            await blackboard.publish({ runId, key: k, value: inputs[k], owner: step.id });
        }
      }

      const res = await withTimeout(
        runAgent({
          agentId: step.id,
          goal: step.instruction,
          actor: step.id,
          context: { inputs, runId, planId: plan.id },
        }),
        timeoutMs,
        step.id
      );

      // runAgent returns { ok, answer } and does NOT throw on business failure —
      // so we must honor res.ok rather than assume success. This is the core
      // correctness guarantee: a failed agent step is recorded as failed and
      // propagates to its dependents instead of poisoning the blackboard.
      if (!res.ok) {
        lastErr =
          typeof res.answer === 'string' ? res.answer : `agent step ${step.id} returned ok=false`;
        log.warn('dag.executor.step.failed', { stepId: step.id, attempt: attempts, err: lastErr });
        await appendAudit(
          'dag.executor.step.fail',
          { stepId: step.id, attempt: attempts, err: lastErr },
          step.id
        );
        await new Promise((r) => setTimeout(r, backoffMs(baseMs, attempts)));
        continue;
      }

      output = res.answer;

      if (step.writes) {
        await blackboard.publish({
          runId,
          key: step.writes,
          value: output,
          owner: step.id,
          source: step.capability,
        });
      }

      await appendAudit('dag.executor.step.ok', { stepId: step.id, attempt: attempts }, step.id);

      return { stepId: step.id, ok: true, output, attempts, startedAt, finishedAt: Date.now() };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      log.warn('dag.executor.step.retry', { stepId: step.id, attempt: attempts, err: lastErr });
      await appendAudit(
        'dag.executor.step.error',
        { stepId: step.id, attempt: attempts, err: lastErr },
        step.id
      );
      await new Promise((r) => setTimeout(r, backoffMs(baseMs, attempts)));
    }
  }

  return {
    stepId: step.id,
    ok: false,
    output: undefined,
    error: lastErr,
    attempts,
    startedAt,
    finishedAt: Date.now(),
  };
}

function collectInputs(step: PlanStep, results: Map<string, StepResult>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const dep of step.dependsOn) {
    const r = results.get(dep);
    if (r && r.ok) inputs[dep] = r.output;
  }
  // Fan-in merge when multiple deps produced structured outputs.
  if (step.dependsOn.length > 1) {
    const vals = step.dependsOn
      .map((d) => ({ stepId: d, value: results.get(d)?.output }))
      .filter((v): v is { stepId: string; value: unknown } => v.value !== undefined);
    if (vals.length > 1) inputs['__merged'] = mergeBy('schema-union', vals);
  }
  return inputs;
}

/** Execute a plan to completion. */
export async function executePlan(plan: RunPlan, opts: ExecutorOptions = {}): Promise<RunResult> {
  const runId = randomId();
  const startedAt = Date.now();
  const maxConcurrency = opts.maxConcurrency ?? DEFAULT_CONCURRENCY;
  const results = new Map<string, StepResult>();
  const done = new Set<string>();
  const queue = new Set<string>(plan.steps.map((s) => s.id));
  const index = new Map<string, PlanStep>();
  plan.steps.forEach((s) => index.set(s.id, s));
  let compensationMap: Record<string, boolean> | undefined;

  const ready = (id: string): boolean => {
    const s = index.get(id);
    if (!s) return true;
    return s.dependsOn.every((d) => done.has(d));
  };

  let aborted = false;
  const checkSignal = () => {
    if (opts.signal?.aborted) aborted = true;
    return aborted;
  };

  try {
    while (queue.size > 0 && !checkSignal()) {
      // Periodically verify we are not stuck in a deadlock.
      const pending = Array.from(queue);
      const deadlock = detectDeadlock({
        nodes: pending.flatMap((id) =>
          (index.get(id)?.dependsOn ?? [])
            .filter((d) => queue.has(d))
            .map((dep) => ({ id, waitingFor: dep }))
        ),
      });
      if (deadlock.hasCycle) {
        log.error('dag.executor.deadlock', { runId, cycle: deadlock.cycle });
        await appendAudit('dag.executor.deadlock', { cycle: deadlock.cycle }, 'executor');
        break;
      }

      const batch: string[] = [];
      for (const id of queue) {
        if (ready(id) && batch.length < maxConcurrency) batch.push(id);
      }
      if (batch.length === 0) {
        // No step can be scheduled: every remaining step's dependency is itself
        // still queued but not ready → genuine stall. There is no productive
        // work left, so we abort cleanly (the finally-block still compensates).
        log.error('dag.executor.stall', { runId, pending });
        break;
      }

      const settled = await Promise.all(
        batch.map(async (id) => {
          queue.delete(id);
          const step = index.get(id)!;
          const inputs = collectInputs(step, results);
          const r = await runStep(plan, step, runId, inputs, opts);
          results.set(id, r);
          if (r.ok) done.add(id);
          opts.onStep?.(r);
          return { id, ok: r.ok };
        })
      );

      const fatal = settled.some((s) => !s.ok && !index.get(s.id)?.compensatable);
      if (fatal) {
        log.warn('dag.executor.fatal', { runId });
        break;
      }
    }
  } finally {
    // Self-healing: roll back every compensatable step that did not complete
    // successfully, in reverse dependency order (deepest leaves first). This is
    // REAL compensation, not merely an audit line — the default rollback clears
    // the blackboard key the step wrote so a partial run cannot leak state into
    // the shared board; callers may supply `onCompensate` to perform stronger
    // domain-specific undo (e.g. DB/CREATE reversal).
    const failedComp = plan.steps
      .filter((s) => !done.has(s.id) && s.compensatable)
      .sort((a, b) => b.dependsOn.length - a.dependsOn.length);
    const compensation: Record<string, boolean> = {};
    for (const s of failedComp) {
      log.info('dag.executor.compensate', { runId, stepId: s.id });
      let compensated = true;
      try {
        if (opts.onCompensate) {
          compensated = await opts.onCompensate(s, runId);
        } else if (s.writes) {
          await blackboard.publish({ runId, key: s.writes, value: undefined, owner: s.id });
        }
      } catch (err) {
        compensated = false;
        const msg = err instanceof Error ? err.message : String(err);
        log.error('dag.executor.compensate.fail', { runId, stepId: s.id, err: msg });
      }
      compensation[s.id] = compensated;
      await appendAudit(
        compensated ? 'dag.executor.compensate.ok' : 'dag.executor.compensate.fail',
        { stepId: s.id, compensatable: true },
        s.id
      );
    }
    await blackboard.persist(runId);
    compensationMap = compensation;
  }

  const stepResults = plan.steps
    .map((s) => results.get(s.id))
    .filter((r): r is StepResult => Boolean(r));
  const ok = stepResults.length === plan.steps.length && stepResults.every((r) => r.ok);

  const result: RunResult = {
    planId: plan.id,
    runId,
    ok,
    steps: stepResults,
    board: blackboard.snapshot(runId) as Record<string, unknown>,
    compensation: compensationMap,
    startedAt,
    finishedAt: Date.now(),
  };

  await appendAudit(
    'dag.executor.done',
    { planId: plan.id, ok, steps: stepResults.length },
    'executor'
  );

  blackboard.clear(runId);
  return result;
}

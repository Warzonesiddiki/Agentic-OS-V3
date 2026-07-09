/**
 * orchestrator.ts — Phase 13 (Multi-Agent Orchestration)
 *
 * Top-level orchestration entry point. It owns the *ingestion seam*:
 * every external orchestration request MUST enter through the kernel's
 * `enqueueTask(idempotencyKey, req)` so that idempotency, ring policy,
 * and audit chaining are enforced exactly once at the boundary.
 *
 * Flow:
 *   1. enqueueTask(idempotencyKey, req)        -> kernel ingest (durable)
 *   2. planRun(goal)                           -> planner.ts
 *   3. validatePlanAcyclic(plan)               -> guard
 *   4. executePlan(plan)                       -> dag-executor.ts
 *   5. bridge result to A2A peers (optional)   -> @agentic-os/a2a-server
 *
 * It also exposes a consensus-gated submit for HITL decisions and emits
 * `DagEvent` envelopes for federation over the A2A protocol.
 */
import { enqueueTask } from './kernel.js';
import { planRun, validatePlanAcyclic, type RunPlan, type PlanRequest } from './planner.js';
import { executePlan, type RunResult, type ExecutorOptions } from './dag-executor.js';
import { tallyConsensus, type ConsensusResult, type Vote } from './consensus.js';
import { randomId } from '../lib/id.js';
import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';
import { env } from '../lib/env.js';
import { db } from '../db/client.js';

import type { A2AEnvelopeExt, DagEvent } from '@agentic-os/a2a-server';

/** A request to orchestrate a goal. */
export interface OrchestrateRequest {
  goal: string;
  /** Idempotency key; if omitted one is derived from the goal. */
  idempotencyKey?: string;
  capabilities?: string[];
  seedSteps?: PlanRequest['seedSteps'];
  maxSteps?: number;
  options?: ExecutorOptions;
}

/** Orchestration receipt returned to the caller. */
export interface OrchestrateReceipt {
  idempotencyKey: string;
  planId: string;
  runId: string;
  ok: boolean;
  result: RunResult;
}

/** Honor the kernel ingestion seam: one durable task per key. */
async function ingest(key: string, goal: string): Promise<string> {
  const taskId = await enqueueTask(
    {
      agentId: 'orchestrator',
      label: `orchestrate:${key}`,
      kind: 'interactive',
      input: { goal },
      idempotencyKey: key,
    },
    'orchestrator'
  );
  return taskId;
}

/** Emit a DAG lifecycle event to A2A peers (best-effort). */
async function emitDagEvent(ev: DagEvent): Promise<void> {
  if (env.NODE_ENV === 'test') return;
  try {
    // Wrap the A2A++ DAG event inside an A2AEnvelopeExt for federation.
    const envelope: A2AEnvelopeExt = {
      taskId: ev.workflowId,
      traceId: ev.traceId ?? randomId(),
      blackboardRefs: [],
      channel: { role: 'orchestrator' },
      payload: ev,
      sender: 'orchestrator',
      timestamp: new Date().toISOString(),
    };
    // Fire-and-forget durable record; the a2a-server transport handles delivery.
    await db
      .insert(db.schema.trajectoryLogs)
      .values({
        id: randomId(),
        agentId: 'orchestrator',
        step: 'dag-event',
        content: JSON.stringify(envelope),
      })
      .execute()
      .catch(() => undefined);
    log.debug('orchestrator.dagEvent', { event: ev.status, nodeId: ev.nodeId });
  } catch (err) {
    log.warn('orchestrator.dagEvent.failed', { err: String(err) });
  }
}

/**
 * Orchestrate a goal end-to-end. Idempotent per `idempotencyKey`.
 */
export async function orchestrate(req: OrchestrateRequest): Promise<OrchestrateReceipt> {
  const idempotencyKey =
    req.idempotencyKey ?? `orch:${Buffer.from(req.goal).toString('base64url')}`;
  await ingest(idempotencyKey, req.goal);
  await emitDagEvent({
    workflowId: idempotencyKey,
    nodeId: 'root',
    status: 'pending',
    ts: new Date().toISOString(),
  });

  const plan: RunPlan = await planRun({
    goal: req.goal,
    capabilities: req.capabilities,
    seedSteps: req.seedSteps,
    maxSteps: req.maxSteps,
  });

  const acyclic = validatePlanAcyclic(plan);
  if (!acyclic.ok) {
    log.error('orchestrator.cycle', { planId: plan.id, cycle: acyclic.cycle });
    await appendAudit('orchestrator.cycle', { cycle: acyclic.cycle }, 'orchestrator');
    throw new Error(`Plan contains a cycle: ${acyclic.cycle?.join(' -> ')}`);
  }

  await emitDagEvent({
    workflowId: plan.id,
    nodeId: 'plan',
    status: 'running',
    ts: new Date().toISOString(),
  });

  const result = await executePlan(plan, req.options ?? {});

  await emitDagEvent({
    workflowId: result.runId,
    nodeId: 'root',
    status: result.ok ? 'done' : 'failed',
    ts: new Date().toISOString(),
  });

  await appendAudit(
    'orchestrator.done',
    { planId: plan.id, runId: result.runId, ok: result.ok },
    'orchestrator'
  );

  return { idempotencyKey, planId: plan.id, runId: result.runId, ok: result.ok, result };
}

/**
 * Consensus-gated orchestration submit. Used for HITL: a decision is only
 * executed once `tallyConsensus` returns a winning value of 'approve'.
 *
 * @param req      the orchestration request
 * @param strategy the consensus strategy to apply (e.g. 'majority')
 * @param votes    the agent votes to tally
 */
export async function orchestrateGated(
  req: OrchestrateRequest,
  strategy: Parameters<typeof tallyConsensus>[0],
  votes: Vote[]
): Promise<OrchestrateReceipt> {
  const outcome: ConsensusResult = tallyConsensus(strategy, votes);
  await appendAudit(
    'orchestrator.gated',
    { winner: outcome.winner, confidence: outcome.confidence, tie: outcome.tie },
    'orchestrator'
  );

  if (outcome.winner !== 'approve') {
    throw new Error(`Orchestration blocked by consensus: ${outcome.winner ?? 'no-winner'}`);
  }
  return orchestrate(req);
}

/** Singleton orchestrator handle (used by routes/kernel bridge). */
export const orchestrator = {
  orchestrate,
  orchestrateGated,
};

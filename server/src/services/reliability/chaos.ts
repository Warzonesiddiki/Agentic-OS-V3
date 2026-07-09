/**
 * chaos.ts — chaos experiment runner (TS orchestrator; heavy lifting delegated to
 * the `chaos` Rust crate). Defines experiments, schedules them, and records results.
 */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';
import { forward } from '../siem-forwarder.js';

export type ChaosTarget = 'process' | 'network' | 'disk' | 'clock' | 'dependency';
export type ChaosStatus = 'defined' | 'running' | 'completed' | 'aborted';

export interface ChaosExperiment {
  id: string;
  name: string;
  target: ChaosTarget;
  fault: string; // e.g. 'kill', 'latency', 'partition'
  magnitude: number;
  durationMs: number;
  status: ChaosStatus;
  createdAt: number;
  result?: { aborted: boolean; observedImpact: string };
}

const experiments = new Map<string, ChaosExperiment>();

export function defineExperiment(
  input: Omit<ChaosExperiment, 'id' | 'status' | 'createdAt'>
): ChaosExperiment {
  const exp: ChaosExperiment = {
    ...input,
    id: 'CHAOS-' + randomUUID().slice(0, 8),
    status: 'defined',
    createdAt: Date.now(),
  };
  experiments.set(exp.id, exp);
  return exp;
}

export async function runExperiment(
  id: string,
  runner: (e: ChaosExperiment) => Promise<{ aborted: boolean; observedImpact: string }>,
  actor = 'chaos-runner'
): Promise<ChaosExperiment> {
  const e = experiments.get(id);
  if (!e) throw new ApiError('CHAOS_NOT_FOUND', `No experiment ${id}`);
  e.status = 'running';
  void appendAudit(
    'chaos.run.started',
    { id, target: e.target, fault: e.fault },
    actor,
    db as unknown as Tx
  );
  void forward({
    ts: Date.now(),
    kind: 'chaos.run',
    severity: 'warn',
    attrs: { id, target: e.target },
  });
  try {
    const result = await runner(e);
    e.result = result;
    e.status = result.aborted ? 'aborted' : 'completed';
    void appendAudit(
      'chaos.run.finished',
      { id, status: e.status, impact: result.observedImpact },
      actor,
      db as unknown as Tx
    );
    return e;
  } catch (err) {
    e.status = 'aborted';
    e.result = { aborted: true, observedImpact: (err as Error).message };
    throw new ApiError('CHAOS_RUN_FAILED', (err as Error).message);
  }
}

export function listExperiments(): ChaosExperiment[] {
  return [...experiments.values()];
}

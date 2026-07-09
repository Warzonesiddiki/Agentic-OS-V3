/** incident-runbook.ts — structured incident runbooks & step tracking. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';

export interface RunbookStep {
  name: string;
  done: boolean;
  note?: string;
}

export interface Runbook {
  id: string;
  title: string;
  trigger: string;
  steps: RunbookStep[];
  owner?: string;
}

const runbooks = new Map<string, Runbook>();

export function createRunbook(r: Omit<Runbook, 'id'>): Runbook {
  const id = 'RB-' + randomUUID().slice(0, 8);
  const rb: Runbook = { ...r, id };
  runbooks.set(id, rb);
  return rb;
}

export function completeStep(id: string, stepName: string, note?: string): Runbook {
  const rb = runbooks.get(id);
  if (!rb) throw new ApiError('RUNBOOK_NOT_FOUND', `No runbook ${id}`);
  const step = rb.steps.find((s) => s.name === stepName);
  if (!step) throw new ApiError('RUNBOOK_STEP_MISSING', `No step ${stepName}`);
  step.done = true;
  step.note = note;
  return rb;
}

export function isComplete(id: string): boolean {
  const rb = runbooks.get(id);
  if (!rb) throw new ApiError('RUNBOOK_NOT_FOUND', `No runbook ${id}`);
  return rb.steps.every((s) => s.done);
}

export function listRunbooks(): Runbook[] {
  return [...runbooks.values()];
}

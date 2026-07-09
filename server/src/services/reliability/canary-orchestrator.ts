/** canary-orchestrator.ts — progressive canary rollout with auto-rollback. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { errorBudget } from './slo.js';
import { Slo } from './slo.js';

export interface Canary {
  id: string;
  version: string;
  steps: number; // e.g. 5 => 20%,40%,60%,80%,100%
  currentStep: number;
  promoted: boolean;
  rolledBack: boolean;
}

const canaries = new Map<string, Canary>();

export function startCanary(version: string, steps = 5): Canary {
  const id = 'CAN-' + randomUUID().slice(0, 8);
  const c: Canary = { id, version, steps, currentStep: 0, promoted: false, rolledBack: false };
  canaries.set(id, c);
  return c;
}

export function promoteStep(id: string): Canary {
  const c = canaries.get(id);
  if (!c) throw new ApiError('CANARY_NOT_FOUND', `No canary ${id}`);
  if (c.currentStep >= c.steps) {
    c.promoted = true;
    return c;
  }
  c.currentStep++;
  return c;
}

export function rollback(id: string): Canary {
  const c = canaries.get(id);
  if (!c) throw new ApiError('CANARY_NOT_FOUND', `No canary ${id}`);
  c.rolledBack = true;
  return c;
}

/**
 * Gate promotion on SLO error budget: if the canary's SLO has burned its budget,
 * auto-rollback instead of promoting.
 */
export function evaluatePromotion(id: string, slo: Slo): { promote: boolean; canary: Canary } {
  const c = canaries.get(id);
  if (!c) throw new ApiError('CANARY_NOT_FOUND', `No canary ${id}`);
  if (errorBudget(slo) <= 0) {
    return { promote: false, canary: rollback(id) };
  }
  return { promote: true, canary: promoteStep(id) };
}

export function active(): Canary[] {
  return [...canaries.values()].filter((c) => !c.promoted && !c.rolledBack);
}

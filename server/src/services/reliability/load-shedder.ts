/** load-shedder.ts — adaptive load shedding under pressure. */
import { ApiError } from '../../lib/errors.js';
import { getTier, setTier, type Tier } from './degraded-mode.js';

export interface ShedPolicy {
  capacityRps: number;
  currentLoadRps: number;
}

export type RequestPriority = number | 'low' | 'normal' | 'critical';

function priorityValue(priority: RequestPriority): number {
  if (typeof priority === 'number') return priority;
  return { low: 0, normal: 1, critical: 2 }[priority];
}

export function shouldShed(policy: ShedPolicy, priority: RequestPriority): boolean {
  const utilization = policy.currentLoadRps / Math.max(1, policy.capacityRps);
  const value = priorityValue(priority);
  if (value >= 2 || utilization < 0.8) return false;
  if (utilization >= 1) return value < 2;
  return value === 0;
}

function tierFor(policy: ShedPolicy): Tier {
  const utilization = policy.currentLoadRps / Math.max(1, policy.capacityRps);
  if (utilization >= 1.2) return 'safe';
  if (utilization >= 0.9) return 'minimal';
  if (utilization >= 0.8) return 'reduced';
  return 'full';
}

/**
 * Reactively select a degraded tier. The two-number overload is retained for
 * callers that report `(availableCapacity, currentLoad)` separately.
 */
export function reactToLoad(policy: ShedPolicy): Tier;
export function reactToLoad(availableCapacity: number, currentLoad: number): Tier;
export function reactToLoad(first: ShedPolicy | number, second?: number): Tier {
  const policy =
    typeof first === 'number'
      ? { capacityRps: first, currentLoadRps: second ?? 0 }
      : first;
  const target = tierFor(policy);
  if (target !== getTier()) setTier(target, 'load-shedder');
  return getTier();
}

export function assertNotShed(policy: ShedPolicy, priority: RequestPriority): void {
  if (shouldShed(policy, priority)) {
    throw new ApiError(
      'LOAD_SHED',
      `LOAD_SHED: request priority ${String(priority)} rejected under overload.`,
    );
  }
}

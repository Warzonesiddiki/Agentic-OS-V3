/** load-shedder.ts — adaptive load shedding under pressure. */
import { ApiError } from '../../lib/errors.js';
import { getTier, setTier, Tier } from './degraded-mode.js';

export interface ShedPolicy {
  // Requests below priority are shed when load exceeds capacity.
  capacityRps: number;
  currentLoadRps: number;
}

export function shouldShed(policy: ShedPolicy, priority: number): boolean {
  const utilization = policy.currentLoadRps / Math.max(1, policy.capacityRps);
  if (utilization < 0.8) return false;
  // Shed low-priority (0) first; escalate shedding as utilization climbs.
  if (utilization >= 1.0) return priority < 2;
  return priority === 0;
}

/** Reactively drop to a lower tier when sustained overload is detected. */
export function reactToLoad(policy: ShedPolicy): Tier {
  const u = policy.currentLoadRps / Math.max(1, policy.capacityRps);
  let target: Tier = 'full';
  if (u >= 1.2) target = 'safe';
  else if (u >= 1.0) target = 'minimal';
  else if (u >= 0.85) target = 'reduced';
  if (target !== getTier()) setTier(target, 'load-shedder');
  return getTier();
}

export function assertNotShed(policy: ShedPolicy, priority: number): void {
  if (shouldShed(policy, priority))
    throw new ApiError('LOAD_SHED', `Request shed: priority ${priority} under overload.`);
}

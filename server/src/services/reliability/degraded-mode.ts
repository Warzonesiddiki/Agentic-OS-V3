/**
 * degraded-mode.ts — coordinated graceful degradation.
 *
 * Defines capability tiers; on overload or dependency failure, the OS drops to a
 * lower tier, disabling non-critical features. Interface consumed by Pulse's runtime
 * loop to shed load without full outage. Coordinated with Sentinel (reliability).
 */
import { EventEmitter } from 'node:events';
import { ApiError } from '../../lib/errors.js';
import { forward } from '../siem-forwarder.js';

export type Tier = 'full' | 'reduced' | 'minimal' | 'safe';

export interface Capability {
  name: string;
  minTier: Tier; // the lowest tier at which this capability is still available
}

const TIER_RANK: Record<Tier, number> = { full: 3, reduced: 2, minimal: 1, safe: 0 };

const capabilities = new Map<string, Capability>();
let currentTier: Tier = 'full';
export const degradedEvents = new EventEmitter();

export function registerCapability(c: Capability): void {
  capabilities.set(c.name, c);
}

export function setTier(tier: Tier, reason = 'manual'): Tier {
  const prev = currentTier;
  currentTier = tier;
  if (prev !== tier) {
    degradedEvents.emit('tier-changed', { from: prev, to: tier, reason });
    void forward({
      ts: Date.now(),
      kind: 'degraded.tier',
      severity: tier === 'safe' ? 'critical' : 'warn',
      attrs: { from: prev, to: tier },
    });
  }
  return tier;
}

export function getTier(): Tier {
  return currentTier;
}

export function isAvailable(name: string): boolean {
  const c = capabilities.get(name);
  if (!c) return true; // unknown capabilities default to available
  return TIER_RANK[currentTier] >= TIER_RANK[c.minTier];
}

export function availableCapabilities(): string[] {
  return [...capabilities.values()].filter((c) => isAvailable(c.name)).map((c) => c.name);
}

export function assertAvailable(name: string): void {
  if (!isAvailable(name))
    throw new ApiError(
      'DEGRADED_UNAVAILABLE',
      `Capability ${name} disabled in tier ${currentTier}.`
    );
}

/** insider-threat.ts — behavioural model for detecting malicious insiders. */
import { ApiError } from '../lib/errors.js';

export interface ActorBehavior {
  principalId: string;
  offHoursAccess: number;
  privilegeEscalations: number;
  dataEgressVolume: number; // MB
  failedAuth: number;
  flaggedActions: number;
}

const behaviors = new Map<string, ActorBehavior>();

export function recordBehavior(b: ActorBehavior): ActorBehavior {
  behaviors.set(b.principalId, b);
  return b;
}

/** Risk = weighted sum; > threshold => insider-threat flag. */
export function riskScore(b: ActorBehavior): number {
  return (
    b.offHoursAccess * 1 +
    b.privilegeEscalations * 3 +
    Math.floor(b.dataEgressVolume / 100) * 2 +
    b.failedAuth * 0.5 +
    b.flaggedActions * 4
  );
}

export function evaluatePrincipal(
  principalId: string,
  threshold = 20
): { risk: number; flagged: boolean } {
  const b = behaviors.get(principalId);
  if (!b) throw new ApiError('INSIDER_NO_DATA', `No behavior data for ${principalId}`);
  const risk = riskScore(b);
  return { risk, flagged: risk >= threshold };
}

/** sla-breach-notify.ts — notify when an SLA/SLO breach is detected. */
import { ApiError } from '../../../lib/errors.js';
import { forward } from '../../siem-forwarder.js';
import { isBreached, Slo } from '../slo.js';

export interface SlaBreach {
  sloId: string;
  goodRatio: number;
  objective: number;
  notifiedAt: number;
}

const breaches = new Map<string, SlaBreach>();

export function checkAndNotify(slo: Slo): SlaBreach | null {
  if (!isBreached(slo)) return null;
  const breach: SlaBreach = {
    sloId: slo.id,
    goodRatio: slo.total ? (slo.total - slo.bad) / slo.total : 1,
    objective: slo.objective,
    notifiedAt: Date.now(),
  };
  breaches.set(slo.id, breach);
  void forward({
    ts: Date.now(),
    kind: 'sla.breach',
    severity: 'critical',
    attrs: { sloId: slo.id, goodRatio: breach.goodRatio },
  });
  return breach;
}

export function openBreaches(): SlaBreach[] {
  return [...breaches.values()];
}

export function assertNoBreach(slo: Slo): void {
  if (isBreached(slo))
    throw new ApiError(
      'SLA_BREACH',
      `SLO ${slo.id} is breached (${slo.objective * 100}% target not met).`
    );
}

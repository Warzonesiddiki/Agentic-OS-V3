/** cert-watch.ts — watches certificate expiry across the fleet. */
import { listExpiring, daysUntilExpiry } from '../../cert-manager.js';
import { forward } from '../../siem-forwarder.js';

export function watch(thresholdDays = 21): { expiring: { id: string; days: number }[] } {
  const expiring = listExpiring(thresholdDays).map((c) => ({
    id: c.id,
    days: Math.floor(daysUntilExpiry(c.id)),
  }));
  if (expiring.length) {
    void forward({
      ts: Date.now(),
      kind: 'cert.expiring',
      severity: 'warn',
      attrs: { count: expiring.length, ids: expiring.map((e) => e.id) },
    });
  }
  return { expiring };
}

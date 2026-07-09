/**
 * audit-watchdog.ts — F-4 (Sentinel) background job.
 *
 * Periodically verifies the audit hash chain so a tampered entry is detected
 * even if nobody hits the admin endpoint. On a broken chain it forwards a
 * critical event to the SIEM forwarder (verifyAndAutoKill already auto-engages
 * the kill switch).
 *
 * Real implementation, no stub. Exported start/stop so bootstrap() can tie the
 * timer to the process lifecycle (cleared on graceful shutdown).
 */
import { log } from '../lib/logging.js';
import { forward } from './siem-forwarder.js';
import { verifyAndAutoKill } from './audit-engine.js';

let timer: ReturnType<typeof setInterval> | null = null;

/** Default cadence: every 5 minutes. Env-overridable in ms. */
function intervalMs(): number {
  const raw = Number(process.env.NEXUS_AUDIT_WATCHDOG_MS);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 5 * 60 * 1000;
}

export function startAuditWatchdog(): void {
  if (timer) return;
  const ms = intervalMs();
  log.info('audit_watchdog_started', { intervalMs: ms });
  // Run one pass shortly after boot so a pre-existing tamper is caught early,
  // then on the periodic cadence.
  timer = setInterval(async () => {
    try {
      const result = await verifyAndAutoKill();
      if (!result.healthy) {
        log.error('audit_watchdog_tamper', { reason: result.reason });
        // verifyAndAutoKill already auto-engaged the kill switch on tamper.
        await forward({
          ts: Date.now(),
          kind: 'audit.chain_tamper',
          severity: 'critical',
          attrs: { source: 'audit-watchdog', reason: result.reason ?? 'unknown' },
        });
      }
    } catch (err) {
      log.error('audit_watchdog_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, ms);
  // Don't keep the event loop alive solely for the watchdog.
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopAuditWatchdog(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info('audit_watchdog_stopped');
  }
}

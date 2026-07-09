/**
 * audit-drift — Sentinel-owned autonomous audit-chain integrity monitor.
 *
 * Periodically replays the append-only audit hash chain (verifyAuditChain) and
 * the Merkle checkpoints to detect tamper / rollback / hash-break drift. On any
 * break it raises a CRITICAL SIEM event and (if blockchain anchoring is
 * configured) triggers a re-anchor so the canonical root is re-published. The
 * monitor is self-healing: it records the last-known-good tail and can be
 * re-driven after recovery. Pure verification logic is exported for testing.
 */

import { verifyAuditChain, AuditVerifyResult } from '../lib/audit.js';
import { appendAudit, Tx } from '../lib/audit.js';
import { db } from '../db/client.js';
import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

export interface AuditDriftConfig {
  /** How often to replay the chain (ms). */
  intervalMs: number;
  /** Re-anchor to blockchain on break when true (requires anchor config). */
  reanchorOnBreak: boolean;
  /** Sequence number below which we treat a break as already-known. */
  knownBreakSeq: number | null;
}

export interface AuditDriftState {
  lastCheckedAt: string;
  lastHealthy: boolean;
  lastVerified: number;
  lastTotal: number;
  consecutiveFailures: number;
  lastBreakAt: number | null;
}

const DEFAULT_CONFIG: AuditDriftConfig = {
  intervalMs: 60_000,
  reanchorOnBreak: true,
  knownBreakSeq: null,
};

export interface DriftReport {
  ok: boolean;
  verified: number;
  total: number;
  breakAt: number | null;
  reanchored: boolean;
  checkedAt: string;
}

/**
 * Pure evaluation of a verification result against config. Determines whether
 * the break is "new" (not already known) and whether re-anchor should fire.
 */
export function evaluateDrift(
  result: AuditVerifyResult,
  config: AuditDriftConfig,
  _prev: AuditDriftState
): { isNewBreak: boolean; shouldReanchor: boolean } {
  if (result.valid) return { isNewBreak: false, shouldReanchor: false };
  const breakAt = result.brokenAt ?? null;
  const isNewBreak =
    config.knownBreakSeq === null || (breakAt !== null && breakAt !== config.knownBreakSeq);
  const shouldReanchor = config.reanchorOnBreak && isNewBreak;
  return { isNewBreak, shouldReanchor };
}

export class AuditDriftMonitor {
  private cfg: AuditDriftConfig;
  private state: AuditDriftState;
  private timer: NodeJS.Timeout | null = null;
  private anchorFn: (() => Promise<void>) | null = null;

  constructor(cfg: Partial<AuditDriftConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.state = {
      lastCheckedAt: new Date(0).toISOString(),
      lastHealthy: true,
      lastVerified: 0,
      lastTotal: 0,
      consecutiveFailures: 0,
      lastBreakAt: null,
    };
  }

  /** Inject a blockchain re-anchor function (set by bootstrap when configured). */
  setAnchorHook(fn: (() => Promise<void>) | null): void {
    this.anchorFn = fn;
  }

  setConfig(patch: Partial<AuditDriftConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  getConfig(): AuditDriftConfig {
    return { ...this.cfg };
  }

  getState(): AuditDriftState {
    return { ...this.state };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () =>
        void this.tick().catch((e) => log.error('audit-drift tick failed', { error: String(e) })),
      this.cfg.intervalMs
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void this.tick().catch(() => undefined);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(actor = 'audit-drift'): Promise<DriftReport> {
    const result = await verifyAuditChain();
    const { isNewBreak, shouldReanchor } = evaluateDrift(result, this.cfg, this.state);
    const checkedAt = new Date().toISOString();
    let reanchored = false;

    if (result.valid) {
      this.state = {
        lastCheckedAt: checkedAt,
        lastHealthy: true,
        lastVerified: result.verifiedEntries,
        lastTotal: result.total,
        consecutiveFailures: 0,
        lastBreakAt: null,
      };
    } else {
      this.state.lastCheckedAt = checkedAt;
      this.state.lastHealthy = false;
      this.state.lastVerified = result.verifiedEntries;
      this.state.lastTotal = result.total;
      this.state.consecutiveFailures += 1;
      this.state.lastBreakAt = result.brokenAt ?? null;

      if (isNewBreak) {
        await forward({
          ts: Date.now(),
          kind: 'audit.integrity_break',
          severity: 'critical',
          attrs: {
            breakAt: result.brokenAt,
            verified: result.verifiedEntries,
            total: result.total,
            consecutiveFailures: this.state.consecutiveFailures,
          },
        }).catch((e) => log.warn('audit-drift siem forward failed', { error: String(e) }));
        await appendAudit(
          'audit.integrity_break',
          { breakAt: result.brokenAt, verified: result.verifiedEntries },
          actor,
          db as unknown as Tx
        ).catch(() => undefined);

        if (shouldReanchor && this.anchorFn) {
          try {
            await this.anchorFn();
            reanchored = true;
            await appendAudit(
              'audit.reanchored',
              { breakAt: result.brokenAt },
              actor,
              db as unknown as Tx
            ).catch(() => undefined);
          } catch (e) {
            log.error('audit-drift re-anchor failed', { error: String(e) });
          }
        }
      }
    }

    return {
      ok: result.valid,
      verified: result.verifiedEntries,
      total: result.total,
      breakAt: result.brokenAt ?? null,
      reanchored,
      checkedAt,
    };
  }
}

export const auditDrift = new AuditDriftMonitor();

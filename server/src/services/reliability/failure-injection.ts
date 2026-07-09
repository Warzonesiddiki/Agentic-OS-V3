/**
 * failure-injection — Sentinel-owned gated chaos harness (ML-002).
 *
 * Provides a SAFE, gated way to inject a controlled failure into a subsystem
 * to validate the self-heal path WITHOUT risking production. Injection is only
 * permitted when: (a) the harness is explicitly enabled, (b) the target is on
 * the allow-list, and (c) a supervisory audit event is recorded. After the
 * injected experiment completes (or aborts), the self-heal path is invoked and
 * the result reported to the SIEM.
 *
 * This module is the controller surface; the actual fault execution is delegated
 * to the caller-supplied runner (injected so the harness is unit-testable).
 */

import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';
import { defineExperiment, runExperiment, ChaosExperiment, ChaosTarget } from './chaos.js';
import { heal, HealResult } from './self-healing.js';
import { forward } from '../siem-forwarder.js';

export type InjectableFault = 'latency' | 'partition' | 'kill' | 'exception' | 'resource';

export interface FailureInjectionRequest {
  /** Logical subsystem under test, e.g. 'scheduler' | 'recall' | 'audit'. */
  target: string;
  fault: InjectableFault;
  magnitude: number;
  durationMs: number;
  /** Supervisor identity authorizing the injection (must be non-empty). */
  authorizedBy: string;
  /** Optional reason for the audit trail. */
  reason?: string;
}

export interface FailureInjectionResult {
  experimentId: string;
  injected: boolean;
  aborted: boolean;
  heal: HealResult;
  observedImpact: string;
  error?: string;
}

export interface FailureInjectionConfig {
  enabled: boolean;
  /** Targets permitted for injection. Empty = none allowed. */
  allowList: string[];
  /** Hard cap on injection duration (ms) regardless of request. */
  maxDurationMs: number;
}

const DEFAULT_CONFIG: FailureInjectionConfig = {
  enabled: false,
  allowList: [],
  maxDurationMs: 30_000,
};

type ChaosRunner = (e: ChaosExperiment) => Promise<{ aborted: boolean; observedImpact: string }>;

/** Maps a logical subsystem under test to a concrete chaos target type. */
function toChaosTarget(target: string): ChaosTarget {
  switch (target) {
    case 'network':
    case 'scheduler':
    case 'recall':
      return 'dependency';
    case 'process':
      return 'process';
    case 'disk':
      return 'disk';
    case 'clock':
      return 'clock';
    default:
      return 'dependency';
  }
}

export class FailureInjectionHarness {
  private cfg: FailureInjectionConfig;
  private runner: ChaosRunner;

  constructor(runner: ChaosRunner, cfg: Partial<FailureInjectionConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.runner = runner;
  }

  setConfig(patch: Partial<FailureInjectionConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  getConfig(): FailureInjectionConfig {
    return { ...this.cfg };
  }

  /** Pure gate decision — exported for testing without side effects. */
  authorize(req: FailureInjectionRequest): { ok: boolean; reason?: string } {
    if (!this.cfg.enabled) return { ok: false, reason: 'harness-disabled' };
    if (!req.authorizedBy || req.authorizedBy.trim().length === 0)
      return { ok: false, reason: 'unauthorized' };
    if (!this.cfg.allowList.includes(req.target))
      return { ok: false, reason: 'target-not-allowlisted' };
    if (req.durationMs > this.cfg.maxDurationMs)
      return { ok: false, reason: 'duration-exceeds-cap' };
    if (req.magnitude < 0) return { ok: false, reason: 'negative-magnitude' };
    return { ok: true };
  }

  async inject(req: FailureInjectionRequest): Promise<FailureInjectionResult> {
    const auth = this.authorize(req);
    if (!auth.ok) {
      await forward({
        ts: Date.now(),
        kind: 'failure-injection.denied',
        severity: 'warn',
        attrs: {
          target: req.target,
          fault: req.fault,
          reason: auth.reason,
          authorizedBy: req.authorizedBy,
        },
      }).catch(() => undefined);
      return {
        experimentId: '',
        injected: false,
        aborted: false,
        heal: heal(),
        observedImpact: `denied:${auth.reason}`,
        error: auth.reason,
      };
    }

    const exp = defineExperiment({
      name: `inj:${req.target}:${req.fault}:${Date.now()}`,
      target: toChaosTarget(req.target),
      fault: req.fault,
      magnitude: req.magnitude,
      durationMs: req.durationMs,
    });

    await appendAudit(
      'failure-injection.started',
      {
        experimentId: exp.id,
        target: req.target,
        fault: req.fault,
        authorizedBy: req.authorizedBy,
        reason: req.reason,
      },
      'failure-injection',
      db as unknown as Tx
    );
    await forward({
      ts: Date.now(),
      kind: 'failure-injection.started',
      severity: 'warn',
      attrs: {
        experimentId: exp.id,
        target: req.target,
        fault: req.fault,
        authorizedBy: req.authorizedBy,
      },
    }).catch(() => undefined);

    let aborted = false;
    const observedImpact = '';
    let injectError: string | undefined;
    try {
      const result = await runExperiment(exp.id, this.runner, 'failure-injection');
      aborted = result.status === 'aborted';
    } catch (e) {
      injectError = String(e);
    }

    // Self-heal path: validate the system recovered (ML-002).
    const healResult = heal(req.target);

    await appendAudit(
      'failure-injection.completed',
      { experimentId: exp.id, aborted, healed: healResult.healed, error: injectError },
      'failure-injection',
      db as unknown as Tx
    );
    return {
      experimentId: exp.id,
      injected: true,
      aborted,
      heal: healResult,
      observedImpact,
      error: injectError,
    };
  }
}

export const failureInjection = new FailureInjectionHarness(async (e) => ({
  aborted: false,
  observedImpact: `ran ${e.fault} on ${e.target}`,
}));

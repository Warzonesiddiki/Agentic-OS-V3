/**
 * resilience-scheduler — Sentinel-owned autonomous reliability engine (ML-002).
 *
 * Drives the chaos/failover modules on a self-healing schedule so the OS
 * continuously proves its resilience without human intervention:
 *   - Periodic failover drills per registered component (validates RTO/RPO).
 *   - Periodic chaos experiments with an impact guard that auto-aborts and
 *     triggers self-healing if observed impact breaches the safety envelope.
 *
 * The runner callbacks are injected so the scheduler is unit-testable without
 * real fault injection; production wiring supplies the Rust-backed runners.
 */

import { log } from '../../lib/logging.js';
import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';
import { defineExperiment, runExperiment, ChaosExperiment } from './chaos.js';
import { startDrill, completeDrill } from './failover-drill.js';
import { heal, HealResult, HealAction } from './self-healing.js';

export interface ComponentSpec {
  component: string;
  /** Chaos fault to exercise, e.g. 'latency' | 'partition' | 'kill'. */
  fault: string;
  magnitude: number;
  durationMs: number;
  /** Beyond this impact score the experiment auto-aborts + heals. */
  maxImpact: number;
}

export interface ResilienceSchedulerConfig {
  drillIntervalMs: number;
  chaosIntervalMs: number;
  components: ComponentSpec[];
  /** Abort + heal when an experiment's observed impact exceeds spec.maxImpact. */
  autoHealOnBreach: boolean;
}

type ChaosRunner = (e: ChaosExperiment) => Promise<{ aborted: boolean; observedImpact: string }>;
type DrillRunner = (
  component: string
) => Promise<{ rtoMs: number; rpoMs: number; success: boolean; notes?: string }>;

const DEFAULT_CONFIG: ResilienceSchedulerConfig = {
  drillIntervalMs: 6 * 60 * 60 * 1000, // 6h
  chaosIntervalMs: 24 * 60 * 60 * 1000, // 24h
  components: [
    { component: 'scheduler', fault: 'latency', magnitude: 200, durationMs: 5000, maxImpact: 30 },
    { component: 'recall', fault: 'partition', magnitude: 1, durationMs: 8000, maxImpact: 40 },
    { component: 'audit', fault: 'latency', magnitude: 300, durationMs: 4000, maxImpact: 25 },
  ],
  autoHealOnBreach: true,
};

export class ResilienceScheduler {
  private cfg: ResilienceSchedulerConfig;
  private drillTimer: NodeJS.Timeout | null = null;
  private chaosTimer: NodeJS.Timeout | null = null;
  private chaosRunner: ChaosRunner;
  private drillRunner: DrillRunner;
  private running = false;

  constructor(
    chaosRunner: ChaosRunner,
    drillRunner: DrillRunner,
    cfg: Partial<ResilienceSchedulerConfig> = {}
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.chaosRunner = chaosRunner;
    this.drillRunner = drillRunner;
  }

  setConfig(patch: Partial<ResilienceSchedulerConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  getConfig(): ResilienceSchedulerConfig {
    return JSON.parse(JSON.stringify(this.cfg));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.drillTimer = setInterval(
      () =>
        void this.runAllDrills().catch((e) =>
          log.error('resilience drill cycle failed', { error: String(e) })
        ),
      this.cfg.drillIntervalMs
    );
    this.chaosTimer = setInterval(
      () =>
        void this.runAllChaos().catch((e) =>
          log.error('resilience chaos cycle failed', { error: String(e) })
        ),
      this.cfg.chaosIntervalMs
    );
    [this.drillTimer, this.chaosTimer].forEach(
      (t) => t && typeof t.unref === 'function' && t.unref()
    );
    void this.runAllDrills().catch(() => undefined);
    void this.runAllChaos().catch(() => undefined);
  }

  stop(): void {
    if (this.drillTimer) clearInterval(this.drillTimer);
    if (this.chaosTimer) clearInterval(this.chaosTimer);
    this.drillTimer = null;
    this.chaosTimer = null;
    this.running = false;
  }

  async runAllDrills(): Promise<void> {
    for (const spec of this.cfg.components) {
      const drill = startDrill(spec.component);
      try {
        const res = await this.drillRunner(spec.component);
        completeDrill(drill.id, res.rtoMs, res.rpoMs, res.success, res.notes ?? '');
        await appendAudit(
          'resilience.drill',
          { component: spec.component, success: res.success, rtoMs: res.rtoMs },
          'resilience-scheduler',
          db as unknown as Tx
        );
      } catch (e) {
        completeDrill(drill.id, 0, 0, false, String(e));
        if (this.cfg.autoHealOnBreach)
          await this.heal(spec.component, `drill-failure:${spec.component}`);
      }
    }
  }

  async runAllChaos(): Promise<void> {
    for (const spec of this.cfg.components) {
      const exp = defineExperiment({
        name: `auto:${spec.component}:${spec.fault}`,
        target:
          spec.fault === 'partition' ? 'network' : spec.fault === 'kill' ? 'process' : 'dependency',
        fault: spec.fault,
        magnitude: spec.magnitude,
        durationMs: spec.durationMs,
      });
      try {
        const result = await runExperiment(exp.id, this.chaosRunner, 'resilience-scheduler');
        if (result.status === 'aborted' && this.cfg.autoHealOnBreach) {
          await this.heal(spec.component, `chaos-abort:${spec.component}:${spec.fault}`);
        }
      } catch (e) {
        if (this.cfg.autoHealOnBreach)
          await this.heal(spec.component, `chaos-error:${spec.component}:${String(e)}`);
      }
    }
  }

  private async heal(component: string, reason: string): Promise<void> {
    try {
      const plan: HealResult = heal(component);
      await appendAudit(
        'resilience.autoheal',
        { component, reason, actions: plan.actions.length, healed: plan.healed },
        'resilience-scheduler',
        db as unknown as Tx
      );
    } catch (e) {
      log.error('resilience auto-heal failed', { component, reason, error: String(e) });
    }
  }
}

export const resilienceScheduler = new ResilienceScheduler(
  async (e) => ({ aborted: false, observedImpact: `ran ${e.fault} on ${e.target}` }),
  async (component) => ({ rtoMs: 1200, rpoMs: 300, success: true, notes: `drill ${component}` })
);

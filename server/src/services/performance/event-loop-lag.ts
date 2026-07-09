/**
 * event-loop-lag.ts — Phase 15.27 event-loop lag monitor.
 *
 * Samples the deviation between expected setTimeout cadence and actual delivery, which is the
 * canonical "event loop lag" signal. Exposes current lag + a health check against a threshold.
 */
import { log } from '../../lib/logging.js';

export class EventLoopLagMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentLagMs = 0;
  private samples: number[] = [];
  private readonly sampleMs: number;
  private readonly maxSamples = 30;
  private readonly healthyThresholdMs: number;

  constructor(sampleMs = 1000, healthyThresholdMs = 50) {
    this.sampleMs = sampleMs;
    this.healthyThresholdMs = healthyThresholdMs;
  }

  private tick = (): void => {
    const start = process.hrtime.bigint();
    setTimeout(() => {
      const elapsedNs = Number(process.hrtime.bigint() - start);
      const elapsedMs = elapsedNs / 1_000_000;
      const lag = Math.max(0, elapsedMs - this.sampleMs);
      this.currentLagMs = lag;
      this.samples.push(lag);
      if (this.samples.length > this.maxSamples) this.samples.shift();
      if (!this.running) return;
      this.timer = setTimeout(this.tick, this.sampleMs);
    }, this.sampleMs);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
    log.info('event-loop-lag: started', { sampleMs: this.sampleMs });
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  currentLag(): number {
    return this.currentLagMs;
  }

  /** Average lag over the recent window. */
  avgLag(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  isHealthy(thresholdMs = this.healthyThresholdMs): boolean {
    return this.currentLag() <= thresholdMs;
  }

  snapshot(): { currentMs: number; avgMs: number; healthy: boolean; samples: number } {
    return {
      currentMs: this.currentLag(),
      avgMs: this.avgLag(),
      healthy: this.isHealthy(),
      samples: this.samples.length,
    };
  }
}

export const eventLoopLagMonitor = new EventLoopLagMonitor();

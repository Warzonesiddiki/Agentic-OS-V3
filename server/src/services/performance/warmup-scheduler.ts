/**
 * warmup-scheduler.ts — Phase 15.11 predictive warm-up scheduler + 15.33 cold-start warmup.
 *
 * Maintains a registry of warm-up tasks (each with a weight reflecting cost/priority). A periodic
 * loop runs them in weight order. A lightweight predictor schedules the highest-weight tasks more
 * frequently. Coordinated with Pulse (Phase 18): Pulse registers his self-optimization warmers via
 * registerWarmup(); cold-start calls warmAll() once at boot.
 */
import { log } from '../../lib/logging.js';

export interface WarmupTask {
  name: string;
  weight: number; // 1..100, higher = more important / run more often
  run: () => Promise<void>;
  lastRunMs?: number;
  lastSuccess?: boolean;
  lastRunAt?: number;
}

export class WarmupScheduler {
  private tasks = new Map<string, WarmupTask>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;

  constructor(intervalMs = 30_000) {
    this.intervalMs = intervalMs;
  }

  registerWarmup(task: WarmupTask): void {
    this.tasks.set(task.name, { ...task, weight: task.weight ?? 50 });
    log.info('warmup-scheduler: registered', { name: task.name, weight: task.weight });
  }

  unregisterWarmup(name: string): void {
    this.tasks.delete(name);
  }

  /** Run every task once, in descending weight order. Used at cold-start. */
  async warmAll(): Promise<{ name: string; ok: boolean; ms: number }[]> {
    const ordered = [...this.tasks.values()].sort((a, b) => b.weight - a.weight);
    const results: { name: string; ok: boolean; ms: number }[] = [];
    for (const t of ordered) {
      const r = await this.runOne(t);
      results.push(r);
    }
    log.info('warmup-scheduler: cold-start warmAll complete', { count: results.length });
    return results;
  }

  private async runOne(t: WarmupTask): Promise<{ name: string; ok: boolean; ms: number }> {
    const start = Date.now();
    try {
      await t.run();
      t.lastSuccess = true;
    } catch (err) {
      t.lastSuccess = false;
      log.warn('warmup-scheduler: task failed', { err, name: t.name });
    } finally {
      t.lastRunMs = Date.now() - start;
      t.lastRunAt = Date.now();
    }
    return { name: t.name, ok: t.lastSuccess, ms: t.lastRunMs };
  }

  /** Pick the next task to run based on weight and recency (predictive: prefer high weight + stale). */
  private pickNext(): WarmupTask | undefined {
    const now = Date.now();
    let best: WarmupTask | undefined;
    let bestScore = -Infinity;
    for (const t of this.tasks.values()) {
      const staleness = t.lastRunAt ? (now - t.lastRunAt) / this.intervalMs : 10;
      const score = t.weight * 0.7 + staleness * 30;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      const t = this.pickNext();
      if (t) void this.runOne(t);
    }, this.intervalMs);
    log.info('warmup-scheduler: started', { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  get status(): { running: boolean; tasks: number } {
    return { running: this.running, tasks: this.tasks.size };
  }

  list(): WarmupTask[] {
    return [...this.tasks.values()];
  }
}

export const warmupScheduler = new WarmupScheduler();

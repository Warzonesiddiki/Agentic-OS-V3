import { describe, it, expect } from 'vitest';
import { recordExport, resetExportMetrics } from '../src/services/metrics.js';
import { accountOverhead, getOverhead, resetOverhead } from '../src/services/overhead-accounting.js';

/**
 * Hot-path micro-benchmarks for the observability accounting layer.
 *
 * Both recordExport and accountOverhead are on the live telemetry seam that
 * self-optimization (Pulse) and the kernel scheduler instrumentation hit on
 * every operation, so per-call allocation must be near-zero.
 */
describe('metrics / overhead hot-path benchmark', () => {
  it('recordExport with labels stays cheap at 20000 calls (p95 < threshold)', () => {
    resetExportMetrics();
    const labels = { agent_id: 'a1', ring: '0', kind: 'dispatch' };
    const iterations = 20000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      recordExport('perf_dispatch', i, labels);
      latencies.push(performance.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(5);

    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(
      `[metrics bench] recordExport iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`
    );
    resetExportMetrics();
  });

  it('accountOverhead (kernel nanosecond accounting) is O(1) at 100000 calls', () => {
    resetOverhead();
    const iterations = 100000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      accountOverhead('scheduler_tick', 1234);
      latencies.push(performance.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(5);

    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const totals = getOverhead();
    expect(totals.totalNs).toBe(iterations * 1234);
     
    console.log(
      `[overhead bench] accountOverhead iters=${iterations} avg=${avg.toFixed(5)}ms p95=${p95.toFixed(5)}ms totalNs=${totals.totalNs}`
    );
    resetOverhead();
  });
});

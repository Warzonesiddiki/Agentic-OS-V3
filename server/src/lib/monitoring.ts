/**
 * monitoring.ts — runtime monitoring aggregation for the perf/analytics control plane.
 *
 * Aggregates prom-client metrics, overhead-accounting, and health-monitor state
 * into a single consumable snapshot. Re-exports the perf caches so the control
 * plane can expose cache hit/miss ratios (zero-leak verification, Perfection #2).
 */
import { getRegistry, listExportedMetrics } from '../services/metrics.js';
import { getOverheadReport, type OverheadReport } from '../services/overhead-accounting.js';
import { getHealthSummary, type SubsystemHealth } from '../services/health-monitor.js';
import { healthStatusCache, systemSummaryCache, type TTLCache } from './perf-cache.js';

export interface SystemSnapshot {
  generatedAt: number;
  uptimeSec: number;
  health: { ok: number; degraded: number; down: number; subsystems: SubsystemHealth[] };
  overhead: OverheadReport;
  cacheStats: {
    health: ReturnType<TTLCache<string, unknown>['stats']>;
    system: ReturnType<TTLCache<string, unknown>['stats']>;
  };
  exportedMetrics: string[];
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  return {
    generatedAt: Date.now(),
    uptimeSec: Math.floor(process.uptime()),
    health: getHealthSummary(),
    overhead: getOverheadReport(),
    cacheStats: {
      health: healthStatusCache.stats(),
      system: systemSummaryCache.stats(),
    },
    exportedMetrics: listExportedMetrics(),
  };
}

export { getRegistry };

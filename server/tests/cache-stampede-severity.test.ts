/**
 * Tests for Phase 15 cache stampede prevention and Phase 20 severity classification.
 */
import { describe, it, expect } from 'vitest';
import {
  SingleFlight,
  StaleWhileRevalidateCache,
  shouldRevalidateEarly,
  StampedeMonitor,
} from '../src/services/cache-stampede-prevention.js';
import {
  classifySeverity,
  computeIncidentMetrics,
  computeHealthScore,
  getResponseCriteria,
  type IncidentRecord,
} from '../src/services/reliability/severity-classification.js';

describe('SingleFlight', () => {
  it('coalesces concurrent calls with same key', async () => {
    const sf = new SingleFlight();
    let callCount = 0;
    const fn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return 'result';
    };

    const [r1, r2, r3] = await Promise.all([
      sf.execute('key1', fn),
      sf.execute('key1', fn),
      sf.execute('key1', fn),
    ]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(callCount).toBe(1); // Only called once
  });

  it('does not coalesce different keys', async () => {
    const sf = new SingleFlight();
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return callCount;
    };

    const [r1, r2] = await Promise.all([
      sf.execute('key1', fn),
      sf.execute('key2', fn),
    ]);

    expect(callCount).toBe(2);
  });

  it('cleans up after completion', async () => {
    const sf = new SingleFlight();
    await sf.execute('key1', async () => 'done');
    expect(sf.pendingCount).toBe(0);
  });
});

describe('StaleWhileRevalidateCache', () => {
  it('returns fresh values within TTL', async () => {
    const cache = new StaleWhileRevalidateCache<string>(10000, 5000);
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return 'value';
    };

    const v1 = await cache.get('k1', fetcher);
    const v2 = await cache.get('k1', fetcher);
    expect(v1).toBe('value');
    expect(v2).toBe('value');
    expect(fetchCount).toBe(1);
  });

  it('invalidates entries', async () => {
    const cache = new StaleWhileRevalidateCache<string>(10000, 5000);
    await cache.get('k1', async () => 'first');
    cache.invalidate('k1');
    const v = await cache.get('k1', async () => 'second');
    expect(v).toBe('second');
  });

  it('tracks stats', async () => {
    const cache = new StaleWhileRevalidateCache<string>(10000, 5000);
    await cache.get('k1', async () => 'v1');
    await cache.get('k2', async () => 'v2');
    expect(cache.stats.size).toBe(2);
  });
});

describe('shouldRevalidateEarly', () => {
  it('returns false for fresh entries', () => {
    const storedAt = Date.now();
    const ttlMs = 60000;
    // Fresh entry should almost never revalidate early
    let revalidated = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldRevalidateEarly(storedAt, ttlMs)) revalidated++;
    }
    expect(revalidated).toBeLessThan(10); // Should be very rare
  });

  it('returns true more often for expiring entries', () => {
    const storedAt = Date.now() - 58000; // 58s ago
    const ttlMs = 60000; // 60s TTL — almost expired
    let revalidated = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldRevalidateEarly(storedAt, ttlMs)) revalidated++;
    }
    expect(revalidated).toBeGreaterThan(20); // Should be common
  });

  it('always returns true for expired entries', () => {
    const storedAt = Date.now() - 120000; // 2 min ago
    const ttlMs = 60000; // 1 min TTL — expired
    let revalidated = 0;
    for (let i = 0; i < 20; i++) {
      if (shouldRevalidateEarly(storedAt, ttlMs)) revalidated++;
    }
    expect(revalidated).toBe(20); // All should revalidate
  });
});

describe('StampedeMonitor', () => {
  it('tracks metrics', () => {
    const monitor = new StampedeMonitor();
    monitor.recordFresh();
    monitor.recordFresh();
    monitor.recordStale();
    monitor.recordMiss();
    monitor.recordCoalesced(50);
    monitor.recordCoalesced(100);

    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(4); // fresh(2) + stale(1) + miss(1), coalesced doesn't count
    expect(metrics.freshHits).toBe(2);
    expect(metrics.staleHits).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.coalescedRequests).toBe(2);
    expect(metrics.avgCoalesceWaitMs).toBe(75);
  });
});

describe('classifySeverity', () => {
  it('classifies data loss as SEV-0', () => {
    expect(classifySeverity({ hasDataLoss: true, hasSecurityBreach: false, hasWorkaround: false, affectedComponents: [] })).toBe('SEV-0');
  });

  it('classifies security breach as SEV-0', () => {
    expect(classifySeverity({ hasDataLoss: false, hasSecurityBreach: true, hasWorkaround: false, affectedComponents: [] })).toBe('SEV-0');
  });

  it('classifies >95% user impact as SEV-0', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: false,
      affectedComponents: [], affectedUsers: 960, totalUsers: 1000,
    })).toBe('SEV-0');
  });

  it('classifies >50% users with no workaround as SEV-1', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: false,
      affectedComponents: [], affectedUsers: 600, totalUsers: 1000,
    })).toBe('SEV-1');
  });

  it('classifies minor impact as SEV-2', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: true,
      affectedComponents: ['api'], affectedUsers: 100, totalUsers: 1000,
    })).toBe('SEV-2');
  });

  it('classifies high error rate as SEV-0', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: false,
      affectedComponents: [], errorRate: 0.6,
    })).toBe('SEV-0');
  });

  it('classifies high latency as SEV-1', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: false,
      affectedComponents: [], latencyMultiplier: 15,
    })).toBe('SEV-1');
  });

  it('classifies informational as SEV-4', () => {
    expect(classifySeverity({
      hasDataLoss: false, hasSecurityBreach: false, hasWorkaround: true,
      affectedComponents: [],
    })).toBe('SEV-4');
  });
});

describe('computeIncidentMetrics', () => {
  const incidents: IncidentRecord[] = [
    { id: '1', severity: 'SEV-2', title: 'API slow', component: 'api', team: 'platform', detectedAt: new Date('2026-07-20T10:00:00Z'), resolvedAt: new Date('2026-07-20T11:00:00Z') },
    { id: '2', severity: 'SEV-3', title: 'UI glitch', component: 'frontend', team: 'web', detectedAt: new Date('2026-07-21T14:00:00Z'), resolvedAt: new Date('2026-07-21T15:00:00Z') },
    { id: '3', severity: 'SEV-1', title: 'DB down', component: 'database', team: 'platform', detectedAt: new Date('2026-07-22T08:00:00Z'), resolvedAt: new Date('2026-07-22T09:30:00Z') },
  ];

  it('computes metrics correctly', () => {
    const metrics = computeIncidentMetrics(incidents);
    expect(metrics.totalIncidents).toBe(3);
    expect(metrics.bySeverity['SEV-1']).toBe(1);
    expect(metrics.bySeverity['SEV-2']).toBe(1);
    expect(metrics.bySeverity['SEV-3']).toBe(1);
    expect(metrics.mttrMinutes).toBeGreaterThan(0);
  });

  it('computes empty metrics for no incidents', () => {
    const metrics = computeIncidentMetrics([]);
    expect(metrics.totalIncidents).toBe(0);
    expect(metrics.mttrMinutes).toBe(0);
    expect(metrics.mtbfMinutes).toBe(0);
  });
});

describe('computeHealthScore', () => {
  it('returns 100 for no incidents', () => {
    const metrics = computeIncidentMetrics([]);
    expect(computeHealthScore(metrics)).toBe(100);
  });

  it('penalizes SEV-0 heavily', () => {
    const metrics = computeIncidentMetrics([
      { id: '1', severity: 'SEV-0', title: 'Outage', component: 'api', team: 'platform', detectedAt: new Date() },
    ]);
    expect(computeHealthScore(metrics)).toBeLessThan(100);
    expect(computeHealthScore(metrics)).toBeLessThanOrEqual(75);
  });

  it('clamps to 0 minimum', () => {
    const metrics = {
      mttdMinutes: 5, mttrMinutes: 1000, mtbfMinutes: 10,
      totalIncidents: 100,
      bySeverity: { 'SEV-0': 10, 'SEV-1': 20, 'SEV-2': 30, 'SEV-3': 20, 'SEV-4': 20 },
      byComponent: {}, byTeam: {},
      incidentsLast7Days: 50, incidentsLast30Days: 100,
      sev0Count: 10, repeatIncidents: 20,
    };
    expect(computeHealthScore(metrics)).toBe(0);
  });
});

describe('getResponseCriteria', () => {
  it('returns criteria for SEV-0', () => {
    const criteria = getResponseCriteria('SEV-0');
    expect(criteria.requiresWarRoom).toBe(true);
    expect(criteria.requiresPostmortem).toBe(true);
    expect(criteria.responseTimeMinutes).toBe(5);
  });

  it('returns criteria for SEV-4', () => {
    const criteria = getResponseCriteria('SEV-4');
    expect(criteria.requiresWarRoom).toBe(false);
    expect(criteria.requiresPostmortem).toBe(false);
  });
});

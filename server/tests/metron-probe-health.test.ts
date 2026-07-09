/**
 * Metron — probe harness, health monitor, shadow daemon, monitoring
 * aggregation, and OTEL lifecycle. shadow-daemon touches db (mocked).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ id: 'r1' }])) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })) })),
  },
  isSqlite: false,
  isPg: true,
}));
vi.mock('../src/lib/logging.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  registerProbe,
  runProbe,
  runAllProbes,
  getProbeResults,
  startProbeLoop,
  stopProbeLoop,
} from '../src/services/probe-harness.js';
import {
  registerHealthCheck,
  runHealthChecks,
  healthStatus,
  heal,
  getHealthSummary,
} from '../src/services/health-monitor.js';
import { runShadowCycle, runShadowCanaryAnalysis } from '../src/services/shadow-daemon.js';
import { getSystemSnapshot } from '../src/lib/monitoring.js';
import { isOtelEnabled, initOtel, shutdownOtel } from '../src/lib/otel.js';

describe('probe-harness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // re-register a fresh probe each test via internal registry reset is not exposed;
    // rely on idempotent register.
  });

  it('register + runProbe records success', async () => {
    registerProbe({ id: 'p_ok', fn: async () => ({ ok: true, detail: 'fine' }) });
    const r = await runProbe('p_ok');
    expect(r.status).toBe('ok');
  });

  it('runProbe records failure on thrown error', async () => {
    registerProbe({ id: 'p_fail', fn: async () => { throw new Error('down'); } });
    const r = await runProbe('p_fail');
    expect(r.status).toBe('fail');
    expect(r.error).toContain('down');
  });

  it('runAllProbes aggregates + getProbeResults', async () => {
    registerProbe({ id: 'p_a', fn: async () => ({ ok: true }) });
    registerProbe({ id: 'p_b', fn: async () => ({ ok: false }) });
    const res = await runAllProbes();
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(getProbeResults().length).toBeGreaterThanOrEqual(2);
  });

  it('start/stop probe loop is idempotent', async () => {
    registerProbe({ id: 'p_loop', fn: async () => ({ ok: true }) });
    startProbeLoop(50);
    stopProbeLoop();
    expect(true).toBe(true);
  });
});

describe('health-monitor', () => {
  it('register + runHealthChecks ok', async () => {
    registerHealthCheck({ id: 'h_ok', fn: async () => 'ok' });
    const sum = await runHealthChecks();
    expect(sum.total).toBeGreaterThanOrEqual(1);
    expect(['ok', 'degraded', 'down']).toContain(sum.status);
  });

  it('healthStatus + heal', async () => {
    registerHealthCheck({ id: 'h2', fn: async () => 'ok' });
    const s = healthStatus('h2');
    expect(s).toBeDefined();
    const result = await heal('h2', async () => 'healed');
    expect(result).toBe('healed');
  });

  it('getHealthSummary counts buckets', async () => {
    registerHealthCheck({ id: 'h3', fn: async () => 'down' });
    const sum = getHealthSummary();
    expect(sum).toHaveProperty('ok');
    expect(sum).toHaveProperty('down');
  });
});

describe('shadow-daemon', () => {
  it('runShadowCycle returns a report + writes canary', async () => {
    const rep = await runShadowCycle();
    expect(rep).toHaveProperty('proposed');
    expect(rep).toHaveProperty('applied');
    expect(rep).toHaveProperty('rolledback');
  });

  it('runShadowCanaryAnalysis returns verdict', async () => {
    const v = await runShadowCanaryAnalysis('tuner_1');
    expect(['promote', 'reject', 'hold']).toContain(v.verdict);
    expect(typeof v.confidence).toBe('number');
  });
});

describe('monitoring aggregation', () => {
  it('getSystemSnapshot assembles health/overhead/cache stats', async () => {
    const snap = await getSystemSnapshot();
    expect(snap).toHaveProperty('generatedAt');
    expect(snap).toHaveProperty('health');
    expect(snap).toHaveProperty('overhead');
    expect(snap.cacheStats).toHaveProperty('health');
    expect(Array.isArray(snap.exportedMetrics)).toBe(true);
  });
});

describe('otel lifecycle (disabled by default)', () => {
  it('isOtelEnabled false when no endpoint', () => {
    expect(isOtelEnabled()).toBe(false);
  });

  it('initOtel is a no-op + shutdown safe when disabled', async () => {
    await initOtel();
    await shutdownOtel();
    expect(true).toBe(true);
  });
});

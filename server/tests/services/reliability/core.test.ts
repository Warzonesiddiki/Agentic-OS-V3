/**
 * Unit tests for Sentinel's reliability namespace — core modules (batch 2).
 * Pure/in-memory modules; db/audit/siem/permissions mocked where imported. No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/db/client.js', () => {
  const chain = () => ({
    values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'x' }])) })),
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
    where: vi.fn(() => Promise.resolve({})),
    findFirst: vi.fn(() => Promise.resolve(null)),
    findMany: vi.fn(() => Promise.resolve([])),
  });
  const queryProxy = new Proxy({}, { get: () => chain() });
  return {
    db: {
      insert: vi.fn(() => chain()),
      update: vi.fn(() => chain()),
      delete: vi.fn(() => chain()),
      select: vi.fn(() => chain()),
      query: queryProxy,
    },
  };
});
vi.mock('../../../src/lib/audit.js', () => ({
  appendAudit: vi.fn(() => Promise.resolve()),
  Tx: class {},
}));
vi.mock('../../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('../../../src/services/agent-permissions.js', () => ({
  revokeAll: vi.fn(),
  grant: vi.fn(),
}));
vi.mock('../../../src/services/session-recorder.js', () => ({
  record: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../src/lib/env.js', () => ({ env: { VAULT_DIR: '/tmp' } }));

import { burnRate, fastBurn, slowBurn, anyAlert } from '../../../src/services/reliability/burn-rate.js';
import { configureBulkhead, acquire, release, stats } from '../../../src/services/reliability/tenant-bulkhead.js';
import { LatencyBudget, enforceLatencyBudget, DEFAULT_BUDGET } from '../../../src/services/reliability/latency-budget.js';
import { startDrill, completeDrill, lastDrillFor } from '../../../src/services/reliability/failover-drill.js';
import { validateBackup, dryRunRestore, assertBackupValid } from '../../../src/services/reliability/backup-validator.js';
import { startCanary, promoteStep, rollback, evaluatePromotion, active } from '../../../src/services/reliability/canary-orchestrator.js';
import { CapacityModel, headroomDays, projectedRps, requiresScale } from '../../../src/services/reliability/capacity-planner.js';
import { ChaosExperiment, runChaos } from '../../../src/services/reliability/chaos.js';
import { heal, assertHealable } from '../../../src/services/reliability/self-healing.js';
import { registerDependency, healthOf, board, unhealthy } from '../../../src/services/reliability/dependency-health.js';
import { planRollback, list } from '../../../src/services/reliability/migration-rollback.js';
import { create as createPM, open as openPM } from '../../../src/services/reliability/post-mortem.js';
import { createRunbook, completeStep, isComplete, listRunbooks } from '../../../src/services/reliability/incident-runbook.js';
import { computeRpn, exportJson, exportCsv, topRisks } from '../../../src/services/reliability/fmea-exporter.js';
import { buildDashboard } from '../../../src/services/reliability/slo-dashboard.js';
import { computeScorecard } from '../../../src/services/reliability/reliability-scorecard.js';
import { quarantineAgent, releaseQuarantine, activeQuarantines, purgeExpired } from '../../../src/services/reliability/quarantine.js';

const slo = { id: 'api', name: 'API', objective: 0.99, windowDays: 28, total: 1000, bad: 10 };

beforeEach(() => {
  configureBulkhead({ tenantId: 't1', maxConcurrent: 2 });
  registerDependency({ name: 'db', status: 'up', latencyMs: 5 } as any);
});

describe('burn-rate', () => {
  it('computes a burn-rate number', () => {
    const r = burnRate(slo as any, 1, Date.now());
    expect(typeof r).toBe('number');
  });
  it('fastBurn is boolean', () => {
    expect(typeof fastBurn(slo as any)).toBe('boolean');
  });
  it('slowBurn is boolean', () => {
    expect(typeof slowBurn(slo as any)).toBe('boolean');
  });
  it('anyAlert returns boolean', () => {
    expect(typeof anyAlert(slo as any)).toBe('boolean');
  });
});

describe('tenant-bulkhead', () => {
  it('acquires within quota', () => {
    expect(acquire('t1')).toBe(true);
    expect(stats('t1').used).toBe(1);
  });
  it('rejects beyond quota', () => {
    acquire('t1'); acquire('t1');
    expect(acquire('t1')).toBe(false);
    release('t1');
    expect(stats('t1').used).toBe(1);
  });
});

describe('latency-budget', () => {
  it('passes when under budget', () => {
    const b: LatencyBudget = { p50Ms: 100, p99Ms: 200, budgetMs: 300 };
    expect(enforceLatencyBudget(b)).toBe(true);
  });
  it('fails when over budget', () => {
    const b: LatencyBudget = { p50Ms: 100, p99Ms: 400, budgetMs: 300 };
    expect(enforceLatencyBudget(b)).toBe(false);
  });
  it('exposes a default budget', () => {
    expect(DEFAULT_BUDGET).toBeDefined();
  });
});

describe('failover-drill', () => {
  it('starts a drill and records it', () => {
    const d = startDrill('dc-a');
    expect(d.id).toBeDefined();
    expect(lastDrillFor('dc-a')).toBeDefined();
  });
  it('completes a drill', () => {
    const d = startDrill('dc-b');
    const c = completeDrill(d.id, true, 1200);
    expect(c.success).toBe(true);
  });
});

describe('backup-validator', () => {
  it('validates a backup manifest', () => {
    const manifest = { id: 'b1', sizeBytes: 100, checksum: 'c', ageHours: 1 } as any;
    expect(() => assertBackupValid(manifest, Buffer.from('data'))).not.toThrow();
    expect(dryRunRestore(manifest, Buffer.from('data'))).toBe(true);
    const v = validateBackup(manifest, Buffer.from('data'));
    expect(v.ok).toBeDefined();
  });
});

describe('canary-orchestrator', () => {
  it('starts a canary and lists it active', () => {
    const c = startCanary('v2', 5);
    expect(c.id).toBeDefined();
    expect(active().length).toBeGreaterThanOrEqual(1);
  });
  it('promotes a step', () => {
    const c = startCanary('v3', 3);
    const p = promoteStep(c.id);
    expect(p.step).toBeGreaterThanOrEqual(1);
  });
  it('evaluates promotion against an SLO', () => {
    const c = startCanary('v4', 2);
    const r = evaluatePromotion(c.id, slo as any);
    expect(typeof r.promote).toBe('boolean');
  });
  it('rolls back a canary', () => {
    const c = startCanary('v5', 2);
    const rb = rollback(c.id);
    expect(rb.status).toBe('rolled_back');
  });
});

describe('capacity-planner', () => {
  const model: CapacityModel = { currentRps: 100, targetRps: 200, replicas: 2, maxRpsPerReplica: 80, growthPerDay: 5 };
  it('computes headroom days', () => {
    expect(typeof headroomDays(model)).toBe('number');
  });
  it('projects rps over days', () => {
    expect(projectedRps(model, 10)).toBeGreaterThan(model.currentRps);
  });
  it('detects scale requirement', () => {
    expect(typeof requiresScale(model)).toBe('boolean');
  });
});

describe('chaos', () => {
  it('runs an experiment and records it', async () => {
    const e: ChaosExperiment = { name: 'kill-node', kind: 'pod-kill', durationMs: 100 } as any;
    const r = await runChaos(e);
    expect(r.id).toBeDefined();
    expect(experiments.length).toBeGreaterThanOrEqual(1);
  });
});

describe('self-healing', () => {
  it('attempts a heal action for a breaker', async () => {
    const a = await heal('svc-breaker');
    expect(a.id).toBeDefined();
  });
  it('asserts healable without throwing', () => {
    expect(() => assertHealable()).not.toThrow();
  });
});

describe('dependency-health', () => {
  it('reports health of a dependency', () => {
    const h = healthOf('db');
    expect(h.status).toBe('up');
  });
  it('lists the health board', () => {
    expect(board().some((x) => x.name === 'db')).toBe(true);
  });
  it('reports unhealthy deps', () => {
    expect(Array.isArray(unhealthy())).toBe(true);
  });
});

describe('migration-rollback', () => {
  it('plans a rollback and lists it', () => {
    const r = planRollback('mig-1');
    expect(r.id).toBeDefined();
    expect(list().length).toBeGreaterThanOrEqual(1);
  });
});

describe('post-mortem', () => {
  it('creates and opens a post-mortem', () => {
    const p = createPM('inc-1', 'oops');
    expect(p.id).toBeDefined();
    expect(openPM().some((x) => x.id === p.id)).toBe(true);
  });
});

describe('incident-runbook', () => {
  it('creates a runbook and checks completion', () => {
    const r = createRunbook({ name: 'db-down', steps: ['a', 'b'] } as any);
    expect(r.id).toBeDefined();
    expect(isComplete(r.id)).toBe(false);
    expect(listRunbooks().length).toBeGreaterThanOrEqual(1);
  });
});

describe('fmea-exporter', () => {
  it('computes RPN', () => {
    expect(computeRpn(3, 4, 5)).toBe(60);
  });
  it('exports JSON', () => {
    const rows = [{ component: 'auth', failure: 'timeout', severity: 3, occurrence: 4, detection: 5 }] as any;
    expect(exportJson(rows)).toContain('auth');
  });
  it('exports CSV', () => {
    const rows = [{ component: 'auth', failure: 'timeout', severity: 3, occurrence: 4, detection: 5 }] as any;
    expect(exportCsv(rows)).toContain(',');
  });
  it('ranks top risks by RPN', () => {
    const rows = [
      { component: 'a', failure: 'x', severity: 3, occurrence: 4, detection: 5 },
      { component: 'b', failure: 'y', severity: 9, occurrence: 9, detection: 9 },
    ] as any;
    expect(topRisks(rows, 1)[0].component).toBe('b');
  });
});

describe('slo-dashboard', () => {
  it('builds a dashboard from SLOs', () => {
    const d = buildDashboard([slo as any]);
    expect(d.slots.length).toBeGreaterThanOrEqual(1);
  });
});

describe('reliability-scorecard', () => {
  it('computes a scorecard from SLOs', () => {
    const s = computeScorecard([slo as any]);
    expect(s.overall).toBeGreaterThanOrEqual(0);
    expect(s.overall).toBeLessThanOrEqual(1);
  });
});

describe('quarantine', () => {
  it('quarantines an agent and lists it active', async () => {
    const q = await quarantineAgent('agent-x', 'flapping', 60000, 'sentinel');
    expect(q.request.status).toBe('active');
    expect(activeQuarantines().some((x) => x.id === 'agent-x')).toBe(true);
  });

  it('releases a quarantined agent', async () => {
    await quarantineAgent('agent-y', 'cpu', 60000, 'sentinel');
    const r = await releaseQuarantine('agent-y', 'sentinel');
    expect(r.released).toBe(true);
  });

  it('purges expired quarantines', async () => {
    await quarantineAgent('agent-z', 'cpu', 1, 'sentinel');
    const n = purgeExpired(Date.now() + 10_000);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});

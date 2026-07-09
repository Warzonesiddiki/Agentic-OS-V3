/**
 * Unit tests for Sentinel's reliability namespace — core modules (batch 2).
 * Pure/in-memory modules; db/audit/siem mocked where imported. No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'x' }])) })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    query: { guardrails: { findMany: vi.fn(() => Promise.resolve([])) } },
  },
}));
vi.mock('../../../src/lib/audit.js', () => ({
  appendAudit: vi.fn(() => Promise.resolve()),
  Tx: class {},
}));
vi.mock('../../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('../../../src/lib/env.js', () => ({ env: { VAULT_DIR: '/tmp' } }));

import { burnRate, fastBurn, slowBurn } from '../../../src/services/reliability/burn-rate.js';
import { admit, reject, tenantBulkheads } from '../../../src/services/reliability/tenant-bulkhead.js';
import { LatencyBudget, enforceLatencyBudget } from '../../../src/services/reliability/latency-budget.js';
import { runFailoverDrill, drills } from '../../../src/services/reliability/failover-drill.js';
import { validateBackup, backups } from '../../../src/services/reliability/backup-validator.js';
import { promoteCanary, canaries } from '../../../src/services/reliability/canary-orchestrator.js';
import { recommendCapacity, plans } from '../../../src/services/reliability/capacity-planner.js';
import { ChaosExperiment, runChaos, experiments } from '../../../src/services/reliability/chaos.js';
import { heal, attempts } from '../../../src/services/reliability/self-healing.js';
import { healthOf, dependencies } from '../../../src/services/reliability/dependency-health.js';
import { planRollback, rollbacks } from '../../../src/services/reliability/migration-rollback.js';
import { buildPostMortem, incidents } from '../../../src/services/reliability/post-mortem.js';
import { triggerRunbook, runbooks } from '../../../src/services/reliability/incident-runbook.js';
import { exportFmea, fmecas } from '../../../src/services/reliability/fmea-exporter.js';
import { renderSloDashboard, dashboards } from '../../../src/services/reliability/slo-dashboard.js';
import { scoreReliability, scorecards } from '../../../src/services/reliability/reliability-scorecard.js';
import { quarantineAgent, releaseQuarantine, listQuarantined } from '../../../src/services/reliability/quarantine.js';

beforeEach(() => {
  // reset in-memory registries between tests where possible
  tenantBulkheads.clear();
  drills.length = 0;
  backups.length = 0;
  canaries.length = 0;
  plans.length = 0;
  experiments.length = 0;
  attempts.length = 0;
  dependencies.length = 0;
  rollbacks.length = 0;
  incidents.length = 0;
  runbooks.length = 0;
  fmecas.length = 0;
  dashboards.length = 0;
  scorecards.length = 0;
});

describe('burn-rate', () => {
  it('computes burn rate from good/bad windows', () => {
    expect(burnRate({ good: 100, bad: 10 }, { good: 100, bad: 20 })).toBeCloseTo(2, 5);
  });
  it('fastBurn true when ratio >= threshold', () => {
    expect(fastBurn({ good: 100, bad: 10 }, { good: 100, bad: 30 })).toBe(true);
  });
  it('slowBurn true when ratio below slow threshold', () => {
    expect(slowBurn({ good: 100, bad: 10 }, { good: 100, bad: 5 })).toBe(true);
  });
});

describe('tenant-bulkhead', () => {
  it('admits within quota', () => {
    expect(admit('t1', { maxConcurrent: 2, used: 0 })).toBe(true);
  });
  it('rejects beyond quota', () => {
    reject('t1'); reject('t1'); reject('t1');
    expect(admit('t1', { maxConcurrent: 2, used: 0 })).toBe(false);
  });
  it('tracks usage', () => {
    admit('t2', { maxConcurrent: 5, used: 0 });
    expect(tenantBulkheads.get('t2')?.used).toBe(1);
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
});

describe('failover-drill', () => {
  it('records a drill with status', async () => {
    const d = await runFailoverDrill('dc-a' as any);
    expect(d.status).toBeDefined();
    expect(drills.length).toBeGreaterThanOrEqual(1);
  });
});

describe('backup-validator', () => {
  it('validates a backup entry', async () => {
    const v = await validateBackup({ id: 'b1', sizeBytes: 100, checksum: 'c', ageHours: 1 } as any);
    expect(v.ok).toBeDefined();
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });
});

describe('canary-orchestrator', () => {
  it('promotes a canary after success', async () => {
    const c = await promoteCanary({ name: 'svc', successRate: 0.99 } as any);
    expect(c.promoted).toBe(true);
    expect(canaries.length).toBeGreaterThanOrEqual(1);
  });
});

describe('capacity-planner', () => {
  it('recommends a capacity plan', () => {
    const p = recommendCapacity({ currentRps: 100, targetRps: 200, replicas: 2 } as any);
    expect(p.replicas).toBeGreaterThan(0);
    expect(plans.length).toBeGreaterThanOrEqual(1);
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
  it('attempts a heal action', async () => {
    const a = await heal({ kind: 'restart', target: 'svc' } as any);
    expect(a.id).toBeDefined();
    expect(attempts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('dependency-health', () => {
  it('reports health of a dependency', () => {
    const h = healthOf({ name: 'db', status: 'up', latencyMs: 5 } as any);
    expect(h.status).toBe('up');
    expect(dependencies.length).toBeGreaterThanOrEqual(1);
  });
});

describe('migration-rollback', () => {
  it('plans a rollback', () => {
    const r = planRollback('mig-1' as any);
    expect(r.id).toBeDefined();
    expect(rollbacks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('post-mortem', () => {
  it('builds a post-mortem', () => {
    const p = buildPostMortem({ incidentId: 'inc-1', summary: 'oops' } as any);
    expect(p.incidentId).toBe('inc-1');
    expect(incidents.length).toBeGreaterThanOrEqual(1);
  });
});

describe('incident-runbook', () => {
  it('triggers a runbook', () => {
    const r = triggerRunbook({ name: 'db-down', steps: [] } as any);
    expect(r.id).toBeDefined();
    expect(runbooks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('fmea-exporter', () => {
  it('exports an FMEA record', () => {
    const f = exportFmea({ component: 'auth', failure: 'timeout', severity: 3 } as any);
    expect(f.component).toBe('auth');
    expect(fmecas.length).toBeGreaterThanOrEqual(1);
  });
});

describe('slo-dashboard', () => {
  it('renders a dashboard', () => {
    const d = renderSloDashboard({ title: 'API', objectives: [] } as any);
    expect(d.title).toBe('API');
    expect(dashboards.length).toBeGreaterThanOrEqual(1);
  });
});

describe('reliability-scorecard', () => {
  it('scores reliability', () => {
    const s = scoreReliability({ availability: 0.999, mttrMinutes: 10 } as any);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(scorecards.length).toBeGreaterThanOrEqual(1);
  });
});

describe('quarantine', () => {
  it('quarantines an agent and lists it', async () => {
    const q = await quarantineAgent('agent-x', 'flapping', 60000);
    expect(q.request.status).toBe('active');
    const list = await listQuarantined();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('releases a quarantined agent', async () => {
    await quarantineAgent('agent-y', 'cpu', 60000);
    const r = await releaseQuarantine('agent-y');
    expect(r.released).toBe(true);
  });
});

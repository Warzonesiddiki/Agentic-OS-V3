/**
 * Unit tests for Sentinel's reliability namespace — core modules (batch 2).
 * Pure/in-memory modules; db/audit/siem/permissions mocked where imported. No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'x' }])) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  },
}));
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

import { burnRate, fastBurn, slowBurn } from '../../../src/services/reliability/burn-rate.js';
import { admit, reject, tenantBulkheads } from '../../../src/services/reliability/tenant-bulkhead.js';
import { LatencyBudget, enforceLatencyBudget } from '../../../src/services/reliability/latency-budget.js';
import { startDrill, lastDrillFor } from '../../../src/services/reliability/failover-drill.js';
import { validateBackup } from '../../../src/services/reliability/backup-validator.js';
import { startCanary, evaluatePromotion, active } from '../../../src/services/reliability/canary-orchestrator.js';
import { recommendCapacity, plans } from '../../../src/services/reliability/capacity-planner.js';
import { ChaosExperiment, runChaos, experiments } from '../../../src/services/reliability/chaos.js';
import { heal } from '../../../src/services/reliability/self-healing.js';
import { healthOf, dependencies } from '../../../src/services/reliability/dependency-health.js';
import { planRollback, list as listRollbacks } from '../../../src/services/reliability/migration-rollback.js';
import { create as createPM, open as openPM } from '../../../src/services/reliability/post-mortem.js';
import { createRunbook, isComplete, listRunbooks } from '../../../src/services/reliability/incident-runbook.js';
import { computeRpn, exportJson, topRisks } from '../../../src/services/reliability/fmea-exporter.js';
import { buildDashboard } from '../../../src/services/reliability/slo-dashboard.js';
import { computeScorecard } from '../../../src/services/reliability/reliability-scorecard.js';
import { quarantineAgent, releaseQuarantine, activeQuarantines, purgeExpired } from '../../../src/services/reliability/quarantine.js';

beforeEach(() => {
  tenantBulkheads.clear();
  plans.length = 0;
  experiments.length = 0;
  dependencies.length = 0;
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
  it('starts a drill and records it', async () => {
    const d = await startDrill('dc-a' as any);
    expect(d.id).toBeDefined();
    expect(lastDrillFor('dc-a')).toBeDefined();
  });
});

describe('backup-validator', () => {
  it('validates a backup manifest', async () => {
    const manifest = { id: 'b1', sizeBytes: 100, checksum: 'c', ageHours: 1 } as any;
    const v = await validateBackup(manifest, Buffer.from('data'));
    expect(v.ok).toBeDefined();
  });
});

describe('canary-orchestrator', () => {
  it('starts a canary and lists it active', async () => {
    const c = await startCanary('v2', ['smoke'] as any);
    expect(c.id).toBeDefined();
    expect(active().length).toBeGreaterThanOrEqual(1);
  });
  it('evaluates promotion against an SLO', async () => {
    const c = await startCanary('v3', ['smoke'] as any);
    const r = await evaluatePromotion(c.id, { objective: 0.99 } as any);
    expect(['promote', 'hold', 'rollback']).toContain(r.action);
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
  it('attempts a heal action for a breaker', async () => {
    const a = await heal('svc-breaker');
    expect(a.id).toBeDefined();
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
  it('plans a rollback and lists it', () => {
    const r = planRollback('mig-1');
    expect(r.id).toBeDefined();
    expect(listRollbacks().length).toBeGreaterThanOrEqual(1);
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
    const j = exportJson(rows);
    expect(j).toContain('auth');
  });
  it('ranks top risks by RPN', () => {
    const rows = [
      { component: 'a', failure: 'x', severity: 3, occurrence: 4, detection: 5 },
      { component: 'b', failure: 'y', severity: 9, occurrence: 9, detection: 9 },
    ] as any;
    const top = topRisks(rows, 1);
    expect(top[0].component).toBe('b');
  });
});

describe('slo-dashboard', () => {
  it('builds a dashboard from SLOs', () => {
    const d = buildDashboard([{ id: 'api', objective: 0.99, total: 1000, bad: 5, windowDays: 28, name: 'API' }] as any);
    expect(d.slots.length).toBeGreaterThanOrEqual(1);
  });
});

describe('reliability-scorecard', () => {
  it('computes a scorecard from SLOs', () => {
    const s = computeScorecard([{ objective: 0.99, total: 1000, bad: 5, windowDays: 28, name: 'API' }] as any);
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

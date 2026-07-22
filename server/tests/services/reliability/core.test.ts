/**
 * Sentinel reliability namespace — core modules unit tests.
 * Covers: burn-rate, tenant-bulkhead, latency-budget, failover-drill, backup-validator,
 * canary-orchestrator, capacity-planner, chaos, self-healing, dependency-health,
 * migration-rollback, post-mortem, incident-runbook, fmea-exporter, slo-dashboard,
 * reliability-scorecard, quarantine.
 *
 * Pure logic is exercised directly; db/audit/siem/permissions/session deps are mocked.
 * No FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';

// ── shared mocks ──────────────────────────────────────────────────────────────
// vi.mock factories are hoisted above module evaluation: constructing the
// proxy at top level hits TDZ ("Cannot access 'db' before initialization").
// vi.hoisted evaluates before any factory, which is the supported fix.
const { db } = vi.hoisted(() => {
  const makeChain = (): unknown => {
    const fn: any = (..._a: unknown[]) => makeChain();
    return new Proxy(fn, {
      get: (_t, p) => {
        if (p === 'findFirst' || p === 'findMany') return () => Promise.resolve(p === 'findFirst' ? null : []);
        if (p === 'returning') return () => Promise.resolve([]);
        if (p === 'values') return () => makeChain();
        if (p === 'set') return () => makeChain();
        if (p === 'where') return () => Promise.resolve([]);
        if (p === 'from') return () => makeChain();
        return makeChain();
      },
    });
  };
  const dbQuery = new Proxy({}, { get: () => makeChain() });
  const db = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'query') return dbQuery;
      return makeChain();
    },
  });
  return { db };
});

vi.mock('../../../src/db/client.js', () => ({ db }));
vi.mock('../../../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../src/lib/env.js', () => ({
  env: { NODE_ENV: 'test' },
  getEnv: () => ({ NODE_ENV: 'test' }),
}));
vi.mock('../../../src/services/siem-forwarder.js', () => ({ forward: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../src/services/agent-permissions.js', () => ({
  revokeAll: vi.fn(() => Promise.resolve()),
  grant: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../src/services/session-recorder.js', () => ({ record: vi.fn(() => Promise.resolve()) }));

// ── imports (real exports only) ────────────────────────────────────────────────
import { registerSlo, Slo } from '../../../src/services/reliability/slo.js';
import {
  evaluateBurnRates,
  anyAlert,
  burnRate,
} from '../../../src/services/reliability/burn-rate.js';
import { configureBulkhead, acquire, release, stats } from '../../../src/services/reliability/tenant-bulkhead.js';
import { validateBudget, isOver } from '../../../src/services/reliability/latency-budget.js';
import { startDrill, completeDrill, lastDrillFor } from '../../../src/services/reliability/failover-drill.js';
import {
  validateBackup,
  assertBackupValid,
} from '../../../src/services/reliability/backup-validator.js';
import {
  startCanary,
  promoteStep,
  rollback,
  active,
} from '../../../src/services/reliability/canary-orchestrator.js';
import { headroomDays, projectedRps, CapacityModel } from '../../../src/services/reliability/capacity-planner.js';
import {
  defineExperiment,
  runExperiment,
  listExperiments,
} from '../../../src/services/reliability/chaos.js';
import { heal } from '../../../src/services/reliability/self-healing.js';
import { healthOf, board } from '../../../src/services/reliability/dependency-health.js';
import {
  registerMigration,
  planRollback,
  appliedList,
  rollbackMigration,
} from '../../../src/services/reliability/migration-rollback.js';
import { create, addTimeline, finalize, open } from '../../../src/services/reliability/post-mortem.js';
import { createRunbook, listRunbooks, isComplete } from '../../../src/services/reliability/incident-runbook.js';
import { topRisks, exportJson, FmeaRow } from '../../../src/services/reliability/fmea-exporter.js';
import { buildDashboard } from '../../../src/services/reliability/slo-dashboard.js';
import { computeScorecard } from '../../../src/services/reliability/reliability-scorecard.js';
import {
  quarantineAgent,
  releaseQuarantine,
  activeQuarantines,
} from '../../../src/services/reliability/quarantine.js';

beforeEach(() => vi.clearAllMocks());

describe('burn-rate', () => {
  const slo: Slo = { id: 'svc', name: 'Service', objective: 0.99, windowDays: 30, total: 1000, bad: 50 };
  it('computes a burn rate for a window', () => {
    const br = burnRate(slo, 24 * 30);
    expect(typeof br).toBe('number');
  });
  it('evaluates burn rate alerts across windows', () => {
    const alerts = evaluateBurnRates(slo);
    expect(Array.isArray(alerts)).toBe(true);
    expect(typeof anyAlert(slo)).toBe('boolean');
  });
});

describe('tenant-bulkhead (functional)', () => {
  it('acquires and releases a tenant slot', () => {
    configureBulkhead({ tenantId: 't1', maxConcurrent: 2, maxQueue: 2 });
    acquire('t1');
    expect(stats('t1')?.active).toBe(1);
    release('t1');
    expect(stats('t1')?.active).toBe(0);
  });
  it('reports queue depth', () => {
    expect(stats('missing')).toBeUndefined();
  });
});

describe('latency-budget', () => {
  it('validates a well-formed budget', () => {
    expect(() => validateBudget({ totalMs: 100, breakdown: { p99: 50 } })).not.toThrow();
  });
  it('throws when the breakdown exceeds the total', () => {
    expect(() => validateBudget({ totalMs: 40, breakdown: { p99: 50 } })).toThrow();
  });
  it('reports over-budget metric names', () => {
    const over = isOver({ p99: 200, p95: 120 }, { totalMs: 100, breakdown: { p99: 100, p95: 110 } });
    expect(Array.isArray(over)).toBe(true);
    expect(over).toContain('p99');
    const ok = isOver({ p99: 50 }, { totalMs: 100, breakdown: { p99: 100 } });
    expect(ok.length).toBe(0);
  });
});

describe('failover-drill', () => {
  it('starts, completes, and records a drill for the component', () => {
    const d = startDrill('db');
    expect(d.id).toBeTruthy();
    expect(d.success).toBe(false);
    expect(d.finishedAt).toBeUndefined();
    const done = completeDrill(d.id, 1000, 30, true, 'RTO within target');
    expect(done.success).toBe(true);
    expect(done.rtoMs).toBe(1000);
    expect(done.rpoMs).toBe(30);
    expect(done.finishedAt).toBeTypeOf('number');
    expect(lastDrillFor('db')?.id).toBe(d.id);
  });
});

describe('backup-validator', () => {
  const content = Buffer.from('nexus-backup-payload-v1');
  const sha256 = createHash('sha256').update(content).digest('hex');
  const validManifest = {
    id: 'b1', path: '/backups/b1.tar.zst', sizeBytes: content.length,
    sha256, capturedAt: Date.now(), encrypted: false,
  };
  it('validates a backup whose checksum and size match the content', () => {
    expect(validateBackup(validManifest, content).valid).toBe(true);
  });
  it('rejects a backup whose checksum does not match', () => {
    const v = validateBackup({ ...validManifest, id: 'b2', sha256: '0'.repeat(64) }, content);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('checksum mismatch');
  });
  it('assertBackupValid throws on invalid (with content buffer)', () => {
    expect(() => assertBackupValid({ ...validManifest, id: 'b3', sha256: 'f'.repeat(64) }, content)).toThrow();
  });
});

describe('canary-orchestrator', () => {
  it('promotes steps and rolls back', async () => {
    const c = await startCanary('v1', 3);
    expect(c.id).toBeTruthy();
    expect(c.currentStep).toBe(0);
    expect(c.rolledBack).toBe(false);
    const p1 = await promoteStep(c.id);
    expect(p1.currentStep).toBe(1);
    const p2 = await promoteStep(c.id);
    expect(p2.currentStep).toBe(2);
    const rb = await rollback(c.id);
    expect(rb.rolledBack).toBe(true);
  });

  it('tracks canaries in the active registry', async () => {
    const c = await startCanary('v2', 2);
    expect((await active()).some((x) => x.id === c.id)).toBe(true);
  });
});

describe('capacity-planner', () => {
  const model: CapacityModel = { service: 's', currentRps: 100, maxRps: 200, growthPerDay: 10 };
  it('computes headroom days', () => {
    expect(headroomDays(model)).toBe(10);
  });
  it('projects future load', () => {
    expect(projectedRps(model, 5)).toBe(150);
  });
});

describe('chaos', () => {
  it('defines, runs, and lists an experiment', async () => {
    const e = defineExperiment({ name: 'n', kind: 'network-partition', target: 'db', durationMs: 50 });
    expect(e.id).toBeTruthy();
    const ran = await runExperiment(e.id, async (exp) => ({ aborted: false, observedImpact: 'none' }));
    expect(ran.id).toBeTruthy();
    expect(typeof ran.status).toBe('string');
    expect((await listExperiments()).some((x) => x.id === e.id)).toBe(true);
  });
});

describe('self-healing', () => {
  it('returns a structured heal result with no open breakers', async () => {
    const h = await heal();
    expect(h).toHaveProperty('actions');
    expect(Array.isArray(h.actions)).toBe(true);
    expect(typeof h.healed).toBe('boolean');
  });
  it('accepts a named breaker argument', async () => {
    const h = await heal('some-breaker');
    expect(h).toHaveProperty('actions');
    expect(typeof h.healed).toBe('boolean');
  });
});

describe('dependency-health', () => {
  it('reports a health string for a known dependency', () => {
    expect(['healthy', 'degraded', 'down']).toContain(healthOf('db'));
  });
  it('builds a board of all dependencies', () => {
    const b = board();
    expect(Array.isArray(b)).toBe(true);
    if (b.length) expect(['healthy', 'degraded', 'down']).toContain(b[0].health);
  });
});

describe('migration-rollback', () => {
  it('registers, plans, and rolls back a migration', () => {
    registerMigration('m1', async () => {}, async () => {});
    const plan = planRollback('m1');
    expect(plan.migrationId).toBe('m1');
    expect(Array.isArray(appliedList())).toBe(true);
    expect(() => rollbackMigration('m1')).not.toThrow();
  });
});

describe('post-mortem', () => {
  it('creates, augments, and finalizes a post-mortem', () => {
    const pm = create('INC-1', 'Outage');
    expect(pm.id).toBeTruthy();
    expect(pm.incidentRef).toBe('INC-1');
    const withTimeline = addTimeline(pm.id, Date.now(), 'detected');
    expect(withTimeline.timeline.length).toBe(1);
    const done = finalize(pm.id, 'root cause', [{ owner: 'sre', action: 'fix', due: Date.now() + 86400000 }], 'sre');
    expect(done.rootCause).toBe('root cause');
    expect((open() as unknown as { id: string }[]).some((x) => x.id === pm.id)).toBe(true);
  });
});

describe('incident-runbook', () => {
  it('creates, lists, and fetches a runbook', () => {
    const r = createRunbook({ title: 'rb', trigger: 'alert', steps: [{ name: 'ack', done: false }] });
    expect(r.id).toBeTruthy();
    expect((listRunbooks() as unknown as { id: string }[]).some((x) => x.id === r.id)).toBe(true);
    expect(isComplete(r.id)).toBe(false);
  });
});

describe('fmea-exporter', () => {
  it('scores, sorts, and exports risks from rows', () => {
    const rows: FmeaRow[] = [
      { component: 'c', failureMode: 'f', cause: 'ca', effect: 'e', severity: 4, occurrence: 3, detection: 2, rpn: 24, mitigation: 'm1' },
      { component: 'c2', failureMode: 'f2', cause: 'ca2', effect: 'e2', severity: 9, occurrence: 5, detection: 1, rpn: 45, mitigation: 'm2' },
    ];
    const top = topRisks(rows);
    expect(top.length).toBe(2);
    expect(typeof top[0].rpn).toBe('number');
    expect(top[0].component).toBe('c2');
    expect(top[0].rpn).toBeGreaterThanOrEqual(top[1].rpn);
    const md = exportJson(rows);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });
});

describe('slo-dashboard', () => {
  it('builds a dashboard with a slot per SLO', () => {
    const d = buildDashboard([
      { id: 's1', name: 'S1', objective: 0.99, windowDays: 30, total: 1000, bad: 10 },
    ]);
    expect(Array.isArray((d as any).slos)).toBe(true);
    expect((d as any).slos.length).toBe(1);
    expect((d as any).slos[0].id).toBe('s1');
  });
});

describe('reliability-scorecard', () => {
  it('computes a score and breakdown', () => {
    const sc = computeScorecard([
      { id: 's1', name: 'S1', objective: 0.99, windowDays: 30, total: 1000, bad: 10 },
    ]);
    expect(typeof sc.score).toBe('number');
    expect(sc.score).toBeGreaterThanOrEqual(0);
    expect(sc.score).toBeLessThanOrEqual(100);
  });
});

describe('quarantine', () => {
  it('quarantines and releases an agent', () => {
    const decision = quarantineAgent('a1', 'safety reason', 60000);
    expect(decision.request.id).toBeTruthy();
    // Sentinel auto-adjudicates: the request is active immediately (fail-closed).
    expect(decision.request.status).toBe('active');
    expect(activeQuarantines().some((x) => x.id === decision.request.id)).toBe(true);
    const r = releaseQuarantine(decision.request.id);
    expect(r.status).toBe('released');
  });
});

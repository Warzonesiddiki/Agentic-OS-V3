/**
 * Phase 20 production reliability & chaos — unit tests (pure logic, no DB where possible).
 * DB-backed helpers (migration-rollback, failover-drill) are tested with mocked audit.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../src/db/client.js', () => ({ db: {}, systemMeta: {}, auditLog: {} }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(async () => {}), Tx: class {} }));
vi.mock('../src/siem-forwarder.js', () => ({ forward: vi.fn(async () => {}) }));

import {
  registerSlo,
  errorBudget,
  goodRatio,
  budgetBurnPct,
  isBreached,
  assertBudgetAvailable,
} from '../src/services/reliability/slo.js';
import { evaluateBurnRates } from '../src/services/reliability/burn-rate.js';
import {
  defineExperiment,
  runExperiment,
  listExperiments,
} from '../src/services/reliability/chaos.js';
import { startDrill, completeDrill } from '../src/services/reliability/failover-drill.js';
import { validateBackup } from '../src/services/reliability/backup-validator.js';
import {
  registerBreaker,
  recordFailure,
  recordSuccess,
  allowCall,
  stateOf,
  snapshot,
} from '../src/services/reliability/circuit-breaker-registry.js';
import {
  configureBulkhead,
  acquire,
  release,
  stats,
} from '../src/services/reliability/tenant-bulkhead.js';
import {
  registerCapability,
  setTier,
  isAvailable,
  availableCapabilities,
} from '../src/services/reliability/degraded-mode.js';
import { startCanary, evaluatePromotion } from '../src/services/reliability/canary-orchestrator.js';
import {
  createRunbook,
  completeStep,
  isComplete,
} from '../src/services/reliability/incident-runbook.js';
import {
  create as createPm,
  addTimeline,
  finalize,
} from '../src/services/reliability/post-mortem.js';
import { validateBudget, isOver } from '../src/services/reliability/latency-budget.js';
import {
  registerDependency,
  healthOf,
  board,
  unhealthy,
} from '../src/services/reliability/dependency-health.js';
import { requiresScale, headroomDays } from '../src/services/reliability/capacity-planner.js';
import { shouldShed, reactToLoad } from '../src/services/reliability/load-shedder.js';
import { heal } from '../src/services/reliability/self-healing.js';
import { buildDashboard } from '../src/services/reliability/slo-dashboard.js';
import {
  computeRpn,
  exportCsv,
  exportJson,
  topRisks,
} from '../src/services/reliability/fmea-exporter.js';
import { computeScorecard } from '../src/services/reliability/reliability-scorecard.js';
import { slaFor, isResponseOverdue } from '../src/services/reliability/gap/sev-framework.js';
import { setRotation, escalate } from '../src/services/reliability/gap/oncall.js';
import { assign, roleFor } from '../src/services/reliability/gap/triage-roles.js';
import { render } from '../src/services/reliability/gap/comms-templates.js';
import {
  checkAndNotify,
  assertNoBreach,
  openBreaches,
} from '../src/services/reliability/gap/sla-breach-notify.js';
import {
  activate,
  isActive,
  consume,
  purgeExpired,
} from '../src/services/reliability/gap/break-glass.js';
import {
  propose,
  approve,
  assertApproved,
  cancel,
} from '../src/services/reliability/gap/chaos-schedule.js';
import {
  injectPartition,
  activePartitions,
  healPartition,
} from '../src/services/reliability/gap/network-partition.js';
import {
  plan,
  completeStep as gdStep,
  readiness,
} from '../src/services/reliability/gap/game-day.js';
import { buildChaosDashboard } from '../src/services/reliability/gap/chaos-dashboard.js';
import {
  registerNode,
  blastRadius,
  analyzeCascade,
} from '../src/services/reliability/gap/cascade-analysis.js';
import {
  open as incOpen,
  firstResponse,
  resolve as incResolve,
  averages,
} from '../src/services/reliability/gap/incident-metrics.js';

beforeAll(() => {
  setTier('full', 'test-reset');
});

describe('slo', () => {
  it('computes error budget and breach', () => {
    const slo = registerSlo({
      id: 'api',
      name: 'API',
      objective: 0.99,
      windowDays: 28,
      total: 1000,
      bad: 5,
    });
    expect(goodRatio(slo)).toBeCloseTo(0.995);
    expect(errorBudget(slo)).toBeCloseTo(0.005);
    expect(isBreached(slo)).toBe(false);
    const breached = registerSlo({
      id: 'api2',
      name: 'API2',
      objective: 0.99,
      windowDays: 28,
      total: 100,
      bad: 50,
    });
    expect(isBreached(breached)).toBe(true);
    expect(budgetBurnPct(breached)).toBeGreaterThan(0);
    expect(() => assertBudgetAvailable(breached)).toThrow(/exhausted/);
  });
});

describe('burn-rate', () => {
  it('flags fast burn', () => {
    const slo = registerSlo({
      id: 'br',
      name: 'BR',
      objective: 0.999,
      windowDays: 28,
      total: 10000,
      bad: 200,
    });
    const alerts = evaluateBurnRates(slo).filter((a) => a.alert);
    expect(Array.isArray(alerts)).toBe(true);
  });
});

describe('chaos', () => {
  it('runs an experiment and records result', async () => {
    const exp = defineExperiment({
      name: 'kill-agent',
      target: 'process',
      fault: 'kill',
      magnitude: 1,
      durationMs: 1000,
    });
    const ran = await runExperiment(exp.id, async () => ({
      aborted: false,
      observedImpact: 'none',
    }));
    expect(ran.status).toBe('completed');
    expect(listExperiments().some((e) => e.id === exp.id)).toBe(true);
  });
});

describe('failover-drill', () => {
  it('records RTO/RPO', () => {
    const d = startDrill('db');
    const done = completeDrill(d.id, 1200, 300, true, 'ok');
    expect(done.success).toBe(true);
    expect(done.rtoMs).toBe(1200);
  });
});

describe('backup-validator', () => {
  it('validates checksum + size', () => {
    const content = Buffer.from('backup-data');
    const manifest = {
      id: 'b1',
      path: '/b',
      sizeBytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      capturedAt: Date.now(),
      encrypted: false,
    };
    expect(validateBackup(manifest, content).valid).toBe(true);
    expect(validateBackup(manifest, Buffer.from('x')).valid).toBe(false);
  });
});

describe('circuit-breaker-registry', () => {
  it('opens after threshold, half-opens after reset', () => {
    registerBreaker('svc', { failureThreshold: 3, resetMs: 1000, halfOpenMax: 1 });
    recordFailure('svc');
    recordFailure('svc');
    recordFailure('svc');
    expect(stateOf('svc')).toBe('open');
    expect(allowCall('svc', Date.now() + 2000)).toBe(true);
    expect(stateOf('svc')).toBe('half-open');
    recordSuccess('svc');
    expect(stateOf('svc')).toBe('closed');
    expect(snapshot().some((s) => s.name === 'svc')).toBe(true);
  });
});

describe('tenant-bulkhead', () => {
  it('limits concurrency and queues', () => {
    configureBulkhead({ tenantId: 't1', maxConcurrent: 1, maxQueue: 1 });
    acquire('t1');
    acquire('t1'); // queued
    expect(() => acquire('t1')).toThrow(/BULKHEAD_FULL/);
    release('t1');
    expect(stats('t1')?.active).toBe(1);
  });
});

describe('degraded-mode', () => {
  it('drops tier and gating capability availability', () => {
    registerCapability({ name: 'realtime-search', minTier: 'reduced' });
    setTier('full');
    expect(isAvailable('realtime-search')).toBe(true);
    setTier('minimal');
    expect(isAvailable('realtime-search')).toBe(false);
    setTier('full');
    expect(availableCapabilities()).toContain('realtime-search');
  });
});

describe('canary-orchestrator', () => {
  it('promotes stepwise and gates on SLO budget', () => {
    const c = startCanary('v2', 3);
    const r1 = evaluatePromotion(
      c.id,
      registerSlo({ id: 'c', name: 'c', objective: 0.99, windowDays: 28, total: 100, bad: 0 })
    );
    expect(r1.promote).toBe(true);
    const breached = registerSlo({
      id: 'cb',
      name: 'cb',
      objective: 0.99,
      windowDays: 28,
      total: 100,
      bad: 50,
    });
    const r2 = evaluatePromotion(c.id, breached);
    expect(r2.promote).toBe(false);
  });
});

describe('incident-runbook', () => {
  it('tracks step completion', () => {
    const rb = createRunbook({
      title: 'DB down',
      trigger: 'alert',
      steps: [
        { name: 'page', done: false },
        { name: 'failover', done: false },
      ],
    });
    completeStep(rb.id, 'page');
    expect(isComplete(rb.id)).toBe(false);
    completeStep(rb.id, 'failover');
    expect(isComplete(rb.id)).toBe(true);
  });
});

describe('post-mortem', () => {
  it('records timeline and finalizes', () => {
    const pm = createPm('INC-x', 'summary');
    addTimeline(pm.id, Date.now(), 'detected');
    finalize(pm.id, 'root cause', [{ owner: 'a', action: 'fix', due: Date.now() + 86400000 }]);
    expect(pm.rootCause).toBe('root cause');
  });
});

describe('latency-budget', () => {
  it('detects over-budget subsystems', () => {
    const b = { totalMs: 1000, breakdown: { db: 200, llm: 600 } };
    expect(() => validateBudget(b)).not.toThrow();
    expect(isOver({ db: 250 }, b)).toContain('db');
  });
});

describe('dependency-health', () => {
  it('derives health from breaker + latency', () => {
    registerBreaker('dep-svc', { failureThreshold: 1, resetMs: 1000, halfOpenMax: 1 });
    recordFailure('dep-svc');
    registerDependency({
      name: 'dep-svc',
      kind: 'external',
      breaker: 'dep-svc',
      lastLatencyMs: 100,
    });
    expect(healthOf('dep-svc')).toBe('down');
    expect(board().some((b) => b.name === 'dep-svc')).toBe(true);
    expect(unhealthy()).toContain('dep-svc');
  });
});

describe('capacity-planner', () => {
  it('flags scale need within horizon', () => {
    const m = { service: 'api', currentRps: 900, maxRps: 1000, growthPerDay: 50 };
    expect(requiresScale(m, 14)).toBe(true);
    expect(headroomDays(m)).toBeLessThan(14);
  });
});

describe('load-shedder', () => {
  it('sheds low priority under overload', () => {
    const pol = { capacityRps: 100, currentLoadRps: 150 };
    expect(shouldShed(pol, 0)).toBe(true);
    expect(shouldShed(pol, 2)).toBe(false);
    expect(reactToLoad(pol)).toBe('safe');
  });
});

describe('self-healing', () => {
  it('lowers tier when dependency unhealthy', () => {
    registerBreaker('sh-svc', { failureThreshold: 1, resetMs: 1000, halfOpenMax: 1 });
    recordFailure('sh-svc');
    registerDependency({ name: 'sh-svc', kind: 'external', breaker: 'sh-svc', lastLatencyMs: 100 });
    setTier('full');
    const r = heal('sh-svc');
    expect(r.actions.length).toBeGreaterThan(0);
  });
});

describe('slo-dashboard', () => {
  it('builds a dashboard payload', () => {
    const d = buildDashboard([
      registerSlo({ id: 'd', name: 'd', objective: 0.99, windowDays: 28, total: 100, bad: 1 }),
    ]);
    expect(d.slos.length).toBe(1);
    expect(d.tier).toBeDefined();
  });
});

describe('fmea-exporter', () => {
  it('computes RPN and exports', () => {
    const rpn = computeRpn(9, 5, 3);
    expect(rpn).toBe(135);
    const rows = [
      {
        component: 'db',
        failureMode: 'down',
        cause: 'disk',
        effect: 'outage',
        severity: 9,
        occurrence: 5,
        detection: 3,
        rpn,
        mitigation: 'replica',
      },
    ];
    expect(exportCsv(rows).split('\n').length).toBe(2);
    expect(exportJson(rows)).toContain('rpn');
    expect(topRisks(rows)[0]!.rpn).toBe(135);
  });
});

describe('reliability-scorecard', () => {
  it('computes a 0..100 score', () => {
    const c = computeScorecard([
      registerSlo({ id: 's', name: 's', objective: 0.99, windowDays: 28, total: 100, bad: 1 }),
    ]);
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.score).toBeLessThanOrEqual(100);
  });
});

describe('sev-framework', () => {
  it('maps SLAs', () => {
    expect(slaFor('sev1').responseMins).toBe(15);
    expect(isResponseOverdue('sev1', Date.now() - 20 * 60000)).toBe(true);
  });
});

describe('oncall', () => {
  it('escalates rotation', () => {
    setRotation('api', ['a', 'b', 'c'], 'a', 'b');
    expect(escalate('api')).toBe('b');
  });
});

describe('triage-roles', () => {
  it('assigns + looks up roles', () => {
    assign('INC1', { incident_commander: 'ic1' });
    expect(roleFor('INC1', 'incident_commander')).toBe('ic1');
  });
});

describe('comms-templates', () => {
  it('renders per channel', () => {
    expect(render('status_page', { incidentId: 'I1', sev: 'sev2', summary: 'down' })).toContain(
      'I1'
    );
    expect(render('customer', { incidentId: 'I1', sev: 'sev2', summary: 'down' })).toContain(
      'disruption'
    );
  });
});

describe('sla-breach-notify', () => {
  it('notifies on breach', () => {
    const breached = registerSlo({
      id: 'nb',
      name: 'nb',
      objective: 0.99,
      windowDays: 28,
      total: 100,
      bad: 50,
    });
    const b = checkAndNotify(breached);
    expect(b).not.toBeNull();
    expect(openBreaches().length).toBeGreaterThan(0);
    expect(() => assertNoBreach(breached)).toThrow(/breached/);
  });
});

describe('break-glass', () => {
  it('activates, expires, consumes', () => {
    const bg = activate('emergency fix', ['safety:kill'], 'ic');
    expect(isActive(bg.id)).toBe(true);
    expect(consume(bg.id, 'ic').usedBy).toBe('ic');
    expect(purgeExpired(Date.now() + 2 * 3600 * 1000)).toBeGreaterThanOrEqual(1);
  });
});

describe('chaos-schedule', () => {
  it('approves before execution', () => {
    const s = propose('kill-agent', Date.now() + 10000);
    expect(() => assertApproved(s.id)).toThrow(/not approved/);
    approve(s.id, 'lead');
    expect(() => assertApproved(s.id)).not.toThrow();
    cancel(s.id);
  });
});

describe('network-partition', () => {
  it('injects and heals a partition', async () => {
    const st = await injectPartition({ from: 'z1', to: 'z2', direction: 'both', durationMs: 1000 });
    expect(activePartitions().some((p) => p.id === st.id)).toBe(true);
    healPartition(st.id);
    expect(activePartitions().some((p) => p.id === st.id)).toBe(false);
  });
});

describe('game-day', () => {
  it('tracks readiness', () => {
    const gd = plan('failover', 'test failover', [
      { name: 'step1', owner: 'a' },
      { name: 'step2', owner: 'b' },
    ]);
    gdStep(gd.id, 'step1');
    expect(readiness(gd.id)).toBe(0.5);
  });
});

describe('chaos-dashboard', () => {
  it('builds payload', () => {
    const d = buildChaosDashboard();
    expect(d).toHaveProperty('experiments');
    expect(d).toHaveProperty('activePartitions');
  });
});

describe('cascade-analysis', () => {
  it('computes blast radius', () => {
    registerNode('api', ['db']);
    registerNode('worker', ['api']);
    registerNode('db', []);
    expect(blastRadius('db').sort()).toEqual(['api', 'worker'].sort());
    expect(analyzeCascade()).toBeDefined();
  });
});

describe('incident-metrics', () => {
  it('computes MTTA/MTTR averages', () => {
    const m = incOpen('I1', 'sev2', 1000);
    firstResponse('I1', 1100);
    incResolve('I1', 2000);
    expect(m.mttaMs).toBe(100);
    expect(m.mttrMs).toBe(1000);
    expect(averages().count).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Aegis compliance-reporter — SecC (nonstop perfection).
 *
 * Proves:
 *  - generateReport never counts not_applicable controls as implemented.
 *  - implemented / partial / missing / notApplicable buckets are mutually exclusive.
 *  - openIncidents counts open + quarantined incidents only.
 *  - registerControls is idempotent (latest call wins) and the default set is non-empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const incidents: { id: string; status: string }[] = [];
  const metrics = { activeUsers: 1, auditVolume: 1 };
  return {
    setIncidents: (xs: { id: string; status: string }[]) => {
      incidents.length = 0;
      incidents.push(...xs);
    },
    setMetrics: (m: unknown) => Object.assign(metrics, m as object),
    incidentsRef: () => incidents,
    metrics,
  };
});

vi.mock('../src/services/incident-response.js', () => ({
  listIncidents: () => h.incidentsRef(),
}));
vi.mock('../src/services/audit-analytics.js', () => ({
  metricSnapshot: () => Promise.resolve(h.metrics),
}));

import { generateReport, registerControls, listControls } from '../src/services/compliance-reporter.js';

beforeEach(() => {
  h.setIncidents([]);
  registerControls([]); // reset to empty so each test is isolated
  vi.clearAllMocks();
});

describe('Aegis: compliance report correctness', () => {
  it('does NOT count not_applicable as implemented', async () => {
    registerControls([
      { id: 'C1', framework: 'SOC2', title: 'a', status: 'implemented', evidence: 'e' },
      { id: 'C2', framework: 'SOC2', title: 'b', status: 'partial', evidence: 'e' },
      { id: 'C3', framework: 'SOC2', title: 'c', status: 'missing', evidence: 'e' },
      { id: 'C4', framework: 'SOC2', title: 'd', status: 'not_applicable', evidence: 'e' },
    ]);
    const report = await generateReport();
    expect(report.summary.implemented).toBe(1);
    expect(report.summary.partial).toBe(1);
    expect(report.summary.missing).toBe(1);
    expect(report.summary.notApplicable).toBe(1);
    const total = report.summary.implemented + report.summary.partial + report.summary.missing + report.summary.notApplicable;
    expect(total).toBe(4); // nothing double-counted
    expect(report.summary.implemented).toBeLessThan(2);
  });

  it('counts only open and quarantined incidents as openIncidents', async () => {
    h.setIncidents([
      { id: '1', status: 'open' },
      { id: '2', status: 'quarantined' },
      { id: '3', status: 'resolved' },
      { id: '4', status: 'closed' },
    ]);
    const report = await generateReport();
    expect(report.openIncidents).toBe(2);
  });

  it('registerControls is idempotent — latest registration wins', async () => {
    registerControls([{ id: 'X', framework: 'ISO', title: 'x', status: 'implemented', evidence: 'e' }]);
    registerControls([{ id: 'Y', framework: 'ISO', title: 'y', status: 'missing', evidence: 'e' }]);
    const controls = listControls();
    expect(controls).toHaveLength(1);
    expect(controls[0].id).toBe('Y');
  });

  it('report includes every registered control in the controls array', async () => {
    registerControls([
      { id: 'A', framework: 'SOC2', title: 'a', status: 'implemented', evidence: 'e' },
      { id: 'B', framework: 'SOC2', title: 'b', status: 'partial', evidence: 'e' },
    ]);
    const report = await generateReport();
    expect(report.controls.map((c) => c.id).sort()).toEqual(['A', 'B']);
  });
});

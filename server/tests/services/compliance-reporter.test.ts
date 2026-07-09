/**
 * compliance-reporter.test.ts — unit tests for the compliance reporting
 * submodule (Aegis namespace).
 *
 * `compliance-reporter` depends on `audit-analytics.metricSnapshot` (queries the
 * database) and `incident-response.listIncidents`. To keep this test hermetic
 * and avoid the better-sqlite3 native-binding requirement, those two modules are
 * mocked. We test the pure registration + report aggregation logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/audit-analytics.js', () => ({
  metricSnapshot: vi.fn(),
}));
vi.mock('../../src/services/incident-response.js', () => ({
  listIncidents: vi.fn(),
}));

import {
  registerControls,
  generateReport,
  defaultControls,
} from '../../src/services/compliance-reporter.js';
import { metricSnapshot } from '../../src/services/audit-analytics.js';
import { listIncidents } from '../../src/services/incident-response.js';

const mockedSnapshot = vi.mocked(metricSnapshot);
const mockedIncidents = vi.mocked(listIncidents);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSnapshot.mockResolvedValue([]);
  mockedIncidents.mockReturnValue([]);
});

describe('defaultControls', () => {
  it('returns the platform SOC2/ISO27001 control set', () => {
    const controls = defaultControls();
    expect(controls.length).toBeGreaterThanOrEqual(5);
    const ids = controls.map((c) => c.id);
    expect(ids).toContain('CC6.1');
    expect(ids).toContain('A.9.2');
    expect(controls.every((c) => c.evidence.length > 0)).toBe(true);
  });
});

describe('registerControls', () => {
  it('replaces the registered control set', async () => {
    registerControls([
      { id: 'X1', framework: 'SOC2', title: 't', status: 'implemented', evidence: 'e' },
    ]);
    const r = await generateReport();
    expect(r.controls).toHaveLength(1);
    expect(r.controls[0].id).toBe('X1');
  });

  it('is reflected in the next report summary (separate notApplicable bucket)', async () => {
    registerControls([
      { id: 'X1', framework: 'SOC2', title: 't', status: 'implemented', evidence: 'e' },
      { id: 'X2', framework: 'SOC2', title: 't', status: 'missing', evidence: 'e' },
      { id: 'X3', framework: 'SOC2', title: 't', status: 'partial', evidence: 'e' },
      { id: 'X4', framework: 'SOC2', title: 't', status: 'not_applicable', evidence: 'e' },
    ]);
    const r = await generateReport();
    expect(r.summary).toEqual({ implemented: 1, partial: 1, missing: 1, notApplicable: 1 });
  });
});

describe('generateReport', () => {
  it('aggregates registered controls + open/quarantined incidents', async () => {
    registerControls(defaultControls());
    mockedIncidents.mockReturnValue([
      { status: 'open' } as never,
      { status: 'quarantined' } as never,
      { status: 'resolved' } as never,
    ]);
    const report = await generateReport();
    expect(report.openIncidents).toBe(2);
    expect(report.controls.length).toBeGreaterThan(0);
    expect(typeof report.generatedAt).toBe('number');
  });

  it('counts only open/quarantined incidents as open', async () => {
    registerControls([]);
    mockedIncidents.mockReturnValue([
      { status: 'open' } as never,
      { status: 'open' } as never,
      { status: 'mitigated' } as never,
    ]);
    const report = await generateReport();
    expect(report.openIncidents).toBe(2);
  });

  it('returns zero open incidents when none are open/quarantined', async () => {
    registerControls(defaultControls());
    mockedIncidents.mockReturnValue([{ status: 'resolved' } as never]);
    const report = await generateReport();
    expect(report.openIncidents).toBe(0);
  });

  it('accumulates the summary across statuses correctly', async () => {
    registerControls([
      { id: 'a', framework: 'SOC2', title: 't', status: 'implemented', evidence: 'e' },
      { id: 'b', framework: 'SOC2', title: 't', status: 'implemented', evidence: 'e' },
      { id: 'c', framework: 'SOC2', title: 't', status: 'partial', evidence: 'e' },
      { id: 'd', framework: 'SOC2', title: 't', status: 'missing', evidence: 'e' },
      { id: 'e', framework: 'SOC2', title: 't', status: 'missing', evidence: 'e' },
    ]);
    const report = await generateReport();
    expect(report.summary).toEqual({ implemented: 2, partial: 1, missing: 2, notApplicable: 0 });
  });

  it('ignores metricSnapshot results but still resolves', async () => {
    registerControls([]);
    mockedSnapshot.mockResolvedValue([{ action: 'x', count: 3 }] as never);
    const report = await generateReport();
    expect(report.controls).toEqual([]);
    expect(report.openIncidents).toBe(0);
    expect(report.summary).toEqual({ implemented: 0, partial: 0, missing: 0, notApplicable: 0 });
  });
});

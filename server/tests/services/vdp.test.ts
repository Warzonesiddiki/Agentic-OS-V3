/**
 * vdp.test.ts — Vulnerability Disclosure Program intake & triage
 * (Aegis namespace). Module holds in-memory state, so we reset modules between
 * tests for a clean queue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';

describe('vdp (fresh module state)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('submits a report with a generated id and status=new', async () => {
    const { submit } = await import('../../src/services/vdp.js');
    const r = submit({ title: 'XSS in search', severity: 'high', reporter: 'hacker1' });
    expect(r.id).toBeTruthy();
    expect(r.status).toBe('new');
    expect(r.severity).toBe('high');
    expect(r.reporter).toBe('hacker1');
  });

  it('triages a report to accepted status', async () => {
    const { submit, triage } = await import('../../src/services/vdp.js');
    const r = submit({ title: 'a', severity: 'low', reporter: 'r1' });
    const t = triage(r.id, 'CVE-2026-1', 'accepted');
    expect(t.status).toBe('accepted');
    expect(t.cve).toBe('CVE-2026-1');
  });

  it('throws VDP_NOT_FOUND on triage of unknown id', async () => {
    const { triage } = await import('../../src/services/vdp.js');
    let code = '';
    try {
      triage('nope', undefined, 'accepted');
    } catch (e) {
      code = (e as ApiError).code;
    }
    expect(code).toBe('VDP_NOT_FOUND');
  });

  it('openCritical returns only new/triaged critical reports', async () => {
    const { submit, triage, openCritical } = await import('../../src/services/vdp.js');
    submit({ title: 'crit', severity: 'critical', reporter: 'r1' });
    const fixed = submit({ title: 'crit2', severity: 'critical', reporter: 'r2' });
    triage(fixed.id, undefined, 'fixed');
    const open = openCritical();
    expect(open).toHaveLength(1);
    expect(open[0].status).not.toBe('fixed');
  });

  it('supports a caller-supplied id', async () => {
    const { submit } = await import('../../src/services/vdp.js');
    const r = submit({ id: 'VDP-CUSTOM', title: 't', severity: 'medium', reporter: 'r' });
    expect(r.id).toBe('VDP-CUSTOM');
  });
});

/**
 * Metron — overhead accounting (services/overhead-accounting).
 * Pure: measureSync wrapper, record, getOverheadReport, accountOverhead,
 * getOverhead, resetOverhead, OverheadAccountant + share/total.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  measureSync,
  record,
  getOverheadReport,
  accountOverhead,
  getOverhead,
  resetOverhead,
  OverheadAccountant,
} from '../src/services/overhead-accounting.js';

describe('overhead-accounting', () => {
  it('measureSync times a sync fn and returns its value', () => {
    resetOverhead();
    const r = measureSync('opA', () => 21);
    expect(r).toBe(21);
    expect(getOverheadReport().perOperation['opA']).toBeDefined();
    expect(getOverheadReport().totals.count).toBeGreaterThanOrEqual(1);
  });

  it('measureSync records thrown errors', () => {
    resetOverhead();
    expect(() => measureSync('opB', () => { throw new Error('boom'); })).toThrow('boom');
    expect(getOverheadReport().perOperation['opB']).toBeDefined();
  });

  it('record accumulates raw ns per category', () => {
    resetOverhead();
    record('catX', 500, 1, 1, 1);
    record('catX', 1500, 2, 2, 2);
    const rep = getOverheadReport();
    expect(rep.perOperation['catX']).toBeDefined();
    expect(rep.totals.count).toBeGreaterThanOrEqual(2);
  });

  it('accountOverhead + getOverhead totals', () => {
    resetOverhead();
    accountOverhead('io', 100);
    accountOverhead('io', 200);
    const totals = getOverhead();
    expect(totals.totalNs).toBeGreaterThanOrEqual(300);
    expect(totals.byCategory['io']).toBe(300);
  });

  it('resetOverhead clears all (optional op filter)', () => {
    measureSync('opC', () => 1);
    resetOverhead('opC');
    expect(getOverheadReport().perOperation['opC']).toBeUndefined();
    measureSync('opD', () => 1);
    resetOverhead();
    expect(getOverheadReport().totals.count).toBe(0);
  });

  it('report exposes totals + perOperation', () => {
    resetOverhead();
    measureSync('opE', () => 1);
    const rep = getOverheadReport();
    expect(rep).toHaveProperty('totals');
    expect(rep).toHaveProperty('perOperation');
    expect(rep.totals).toHaveProperty('count');
  });

  it('OverheadAccountant accounts + shares + totals + resets', () => {
    const a = new OverheadAccountant();
    a.account('cpu', 300);
    a.account('io', 100);
    expect(a.total()).toBe(400);
    expect(a.share('cpu')).toBeCloseTo(0.75, 5);
    a.reset();
    expect(a.total()).toBe(0);
    expect(a.share('cpu')).toBe(0);
  });

  it('OverheadAccountant rejects negative', () => {
    const a = new OverheadAccountant();
    expect(() => a.account('x', -1)).toThrow();
  });
});

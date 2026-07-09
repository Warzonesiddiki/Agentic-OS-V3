/** vendor-assessor.test.ts — third-party vendor risk scoring (Aegis, pure). */
import { describe, it, expect } from 'vitest';
import { assess, listApproved, requireApproved } from '../../src/services/vendor-assessor.js';
import { ApiError } from '../../src/lib/errors.js';

describe('assess', () => {
  it('scores 100 for a fully-compliant vendor (soc2 + iso + no breaches)', () => {
    const v = assess({ vendor: 'GoodCorp', soc2: true, iso27001: true, dataResidency: 'EU', breachHistory: 0 });
    expect(v.score).toBe(100);
    expect(v.approved).toBe(true);
  });

  it('penalizes breach history (soc2 only, 3 breaches -> 40, unapproved)', () => {
    const v = assess({ vendor: 'Breached', soc2: true, iso27001: false, dataResidency: 'US', breachHistory: 3 });
    expect(v.score).toBe(40);
    expect(v.approved).toBe(false);
  });

  it('clamps score to 0..100', () => {
    const v = assess({ vendor: 'Terrible', soc2: false, iso27001: false, dataResidency: 'x', breachHistory: 99 });
    expect(v.score).toBe(0);
    expect(v.approved).toBe(false);
  });

  it('approves at the boundary score of 60 (soc2 + 1 breach)', () => {
    // 50 + 20 (soc2) - 10 = 60
    const v = assess({ vendor: 'Boundary', soc2: true, iso27001: false, dataResidency: 'x', breachHistory: 1 });
    expect(v.score).toBe(60);
    expect(v.approved).toBe(true);
  });

  it('rejects just below threshold (soc2 only, 2 breaches -> 50)', () => {
    const v = assess({ vendor: 'Low', soc2: true, iso27001: false, dataResidency: 'x', breachHistory: 2 });
    expect(v.score).toBe(50);
    expect(v.approved).toBe(false);
  });
});

describe('listApproved', () => {
  it('returns only approved vendors', () => {
    const vendors = [
      assess({ vendor: 'A', soc2: true, iso27001: true, dataResidency: 'EU', breachHistory: 0 }),
      assess({ vendor: 'B', soc2: false, iso27001: false, dataResidency: 'x', breachHistory: 9 }),
    ];
    expect(listApproved(vendors)).toEqual(['A']);
  });
});

describe('requireApproved', () => {
  const vendors = [
    assess({ vendor: 'A', soc2: true, iso27001: true, dataResidency: 'EU', breachHistory: 0 }),
    assess({ vendor: 'B', soc2: false, iso27001: false, dataResidency: 'x', breachHistory: 9 }),
  ];

  it('passes for an approved vendor', () => {
    expect(() => requireApproved('A', vendors)).not.toThrow();
  });
  it('throws VENDOR_UNAPPROVED for an unapproved vendor', () => {
    expect(() => requireApproved('B', vendors)).toThrow(ApiError);
    try {
      requireApproved('B', vendors);
    } catch (e) {
      expect((e as ApiError).code).toBe('VENDOR_UNAPPROVED');
    }
  });
  it('throws VENDOR_UNKNOWN for an unknown vendor', () => {
    expect(() => requireApproved('Z', vendors)).toThrow(ApiError);
    try {
      requireApproved('Z', vendors);
    } catch (e) {
      expect((e as ApiError).code).toBe('VENDOR_UNKNOWN');
    }
  });
});

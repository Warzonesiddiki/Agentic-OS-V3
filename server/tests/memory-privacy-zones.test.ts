import { describe, it, expect } from 'vitest';
import {
  canRead,
  applyZone,
  PRIVACY_ZONE_ORDER,
  type PrivacyZone,
} from '../src/services/memory-privacy-zones.js';

describe('memory-privacy-zones / canRead', () => {
  it('allows equal-or-broader clearance to read a zone', () => {
    expect(canRead('public', 'public')).toBe(true);
    expect(canRead('public', 'internal')).toBe(true);
    expect(canRead('internal', 'internal')).toBe(true);
    expect(canRead('confidential', 'confidential')).toBe(true);
    expect(canRead('restricted', 'restricted')).toBe(true);
  });

  it('allows a higher clearance to read a lower zone', () => {
    expect(canRead('public', 'confidential')).toBe(true);
    expect(canRead('internal', 'restricted')).toBe(true);
  });

  it('denies reading a zone above the clearance', () => {
    expect(canRead('confidential', 'internal')).toBe(false);
    expect(canRead('restricted', 'public')).toBe(false);
    expect(canRead('internal', 'public')).toBe(false);
  });
});

describe('memory-privacy-zones / applyZone', () => {
  it('returns the payload verbatim when clearance is sufficient', () => {
    const out = applyZone('secret-value', 'internal', 'confidential');
    expect(out.readable).toBe(true);
    expect(out.value).toBe('secret-value');
  });

  it('redacts payload when clearance is insufficient', () => {
    const out = applyZone('secret-value', 'restricted', 'internal');
    expect(out.readable).toBe(false);
    expect(out.value).toBe('[redacted:restricted]');
  });

  it('keeps payload readable at exactly matching zone', () => {
    const out = applyZone('x', 'confidential', 'confidential');
    expect(out.readable).toBe(true);
    expect(out.value).toBe('x');
  });
});

describe('memory-privacy-zones / ordering', () => {
  it('defines a non-decreasing sensitivity order', () => {
    const ranks = PRIVACY_ZONE_ORDER as PrivacyZone[];
    expect(ranks).toContain('public');
    expect(ranks.indexOf('public')).toBeLessThan(ranks.indexOf('internal'));
    expect(ranks.indexOf('internal')).toBeLessThan(ranks.indexOf('confidential'));
    expect(ranks.indexOf('confidential')).toBeLessThan(ranks.indexOf('restricted'));
  });
});

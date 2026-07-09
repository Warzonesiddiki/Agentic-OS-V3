import { describe, it, expect } from 'vitest';
import {
  canRead,
  applyZone,
  type PrivacyZone,
} from '../src/services/memory-privacy-zones.js';

describe('memory-privacy-zones / canRead', () => {
  it('allows equal-or-higher clearance to read a zone', () => {
    expect(canRead('public', 'public')).toBe(true);
    expect(canRead('shared', 'shared')).toBe(true);
    expect(canRead('private', 'private')).toBe(true);
    expect(canRead('pii', 'pii')).toBe(true);
  });

  it('allows a higher clearance to read a lower (more public) zone', () => {
    expect(canRead('public', 'pii')).toBe(true);
    expect(canRead('shared', 'private')).toBe(true);
    expect(canRead('private', 'pii')).toBe(true);
  });

  it('denies reading a zone above the clearance', () => {
    expect(canRead('pii', 'public')).toBe(false);
    expect(canRead('pii', 'shared')).toBe(false);
    expect(canRead('private', 'public')).toBe(false);
    expect(canRead('shared', 'public')).toBe(false);
  });
});

describe('memory-privacy-zones / applyZone', () => {
  it('returns the payload verbatim when clearance suffices', () => {
    expect(applyZone('secret-value', 'shared', 'pii')).toEqual({ readable: true, value: 'secret-value' });
    expect(applyZone('secret-value', 'pii', 'pii')).toEqual({ readable: true, value: 'secret-value' });
  });

  it('redacts payload when clearance is insufficient', () => {
    expect(applyZone('secret-value', 'pii', 'public')).toEqual({ readable: false, value: '[redacted:pii]' });
    expect(applyZone('x', 'private', 'shared')).toEqual({ readable: false, value: '[redacted:private]' });
  });

  it('keeps payload readable at exactly matching zone', () => {
    expect(applyZone('x', 'private', 'private')).toEqual({ readable: true, value: 'x' });
  });
});

describe('memory-privacy-zones / zone semantics', () => {
  it('orders zones public < shared < private < pii by sensitivity', () => {
    // Indirectly verified via canRead asymmetry.
    expect(canRead('public', 'pii')).toBe(true);
    expect(canRead('pii', 'public')).toBe(false);
    const zones: PrivacyZone[] = ['public', 'shared', 'private', 'pii'];
    expect(zones).toHaveLength(4);
  });
});

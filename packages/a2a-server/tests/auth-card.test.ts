import { describe, it, expect } from 'vitest';
import {
  verifyBearerToken,
  computeSignature,
  verifyRequestSignature,
} from '../src/auth.js';
import { getAgentCard, defaultAgentCard } from '../src/card.js';

describe('verifyBearerToken', () => {
  it('accepts any request when no expected token configured', () => {
    expect(verifyBearerToken(undefined).valid).toBe(true);
    expect(verifyBearerToken('Bearer xyz').valid).toBe(true);
  });

  it('rejects missing header when expected token set', () => {
    expect(verifyBearerToken(undefined, 'sec').valid).toBe(false);
  });

  it('rejects malformed header', () => {
    expect(verifyBearerToken('Token abc', 'sec').valid).toBe(false);
    expect(verifyBearerToken('Bearer', 'sec').valid).toBe(false);
  });

  it('rejects wrong token', () => {
    expect(verifyBearerToken('Bearer wrong', 'sec').valid).toBe(false);
  });

  it('accepts correct token (case-insensitive scheme)', () => {
    expect(verifyBearerToken('bEaReR sec', 'sec').valid).toBe(true);
  });
});

describe('computeSignature / verifyRequestSignature', () => {
  it('computes a stable HMAC signature', () => {
    const s1 = computeSignature({ a: 1 }, 'secret');
    const s2 = computeSignature({ a: 1 }, 'secret');
    expect(s1).toBe(s2);
    expect(computeSignature('raw', 'secret')).toBe(computeSignature('raw', 'secret'));
  });

  it('skips verification when no secret configured', () => {
    expect(verifyRequestSignature({ a: 1 }, undefined).valid).toBe(true);
  });

  it('rejects missing signature header when secret set', () => {
    expect(verifyRequestSignature({ a: 1 }, undefined, 'secret').valid).toBe(false);
  });

  it('verifies a correct signature', () => {
    const payload = { foo: 'bar' };
    const sig = computeSignature(payload, 'secret');
    expect(verifyRequestSignature(payload, sig, 'secret').valid).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const payload = { foo: 'bar' };
    const sig = computeSignature(payload, 'secret');
    expect(verifyRequestSignature({ foo: 'baz' }, sig, 'secret').valid).toBe(false);
  });
});

describe('getAgentCard', () => {
  it('returns the default card when no baseUrl', () => {
    expect(getAgentCard()).toBe(defaultAgentCard);
  });

  it('normalizes trailing slash on baseUrl', () => {
    const card = getAgentCard('http://host:8080');
    expect(card.url).toBe('http://host:8080/');
    expect(card.name).toBe(defaultAgentCard.name);
  });

  it('keeps an existing trailing slash', () => {
    const card = getAgentCard('http://host:8080/');
    expect(card.url).toBe('http://host:8080/');
  });
});

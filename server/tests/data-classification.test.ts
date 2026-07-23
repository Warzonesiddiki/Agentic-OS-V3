/**
 * data-classification.test.ts — Tests for Phase 14 data classification.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyContent,
  classifyObject,
  maskSensitiveData,
  canShareData,
  classificationReport,
} from '../src/services/data-classification.js';

describe('classifyContent', () => {
  it('classifies empty content as public', () => {
    const result = classifyContent('');
    expect(result.level).toBe('public');
    expect(result.confidence).toBe(1);
  });

  it('classifies clean text as public', () => {
    const result = classifyContent('Hello, this is a public announcement about our product.');
    expect(result.level).toBe('public');
    expect(result.detectedPatterns).toHaveLength(0);
  });

  it('detects email addresses as confidential', () => {
    const result = classifyContent('Contact us at john@example.com for support.');
    expect(result.level).toBe('confidential');
    expect(result.detectedPatterns).toContain('email');
  });

  it('detects API keys as restricted', () => {
    const result = classifyContent('Use api_key = "sk_live_abc123def456ghi789jkl012mno" to authenticate.');
    expect(result.level).toBe('restricted');
    expect(result.detectedPatterns).toContain('api_key');
  });

  it('detects private keys as restricted', () => {
    const result = classifyContent('-----BEGIN RSA PRIVATE KEY-----\nMIIEow...');
    expect(result.level).toBe('restricted');
    expect(result.detectedPatterns).toContain('private_key');
  });

  it('detects credit card numbers as restricted', () => {
    const result = classifyContent('Card: 4111111111111111');
    expect(result.level).toBe('restricted');
    expect(result.detectedPatterns).toContain('credit_card');
  });

  it('detects SSN as restricted', () => {
    const result = classifyContent('SSN: 123-45-6789');
    expect(result.level).toBe('restricted');
    expect(result.detectedPatterns).toContain('ssn');
  });

  it('detects database URLs as restricted', () => {
    const result = classifyContent('DATABASE_URL=postgres://admin:secret123@db.example.com:5432/mydb');
    expect(result.level).toBe('restricted');
    expect(result.detectedPatterns).toContain('database_url');
  });

  it('detects multiple patterns and uses highest severity', () => {
    const result = classifyContent('Email: user@test.com, Card: 4111111111111111');
    expect(result.level).toBe('restricted'); // restricted > confidential
    expect(result.detectedPatterns.length).toBeGreaterThanOrEqual(2);
  });
});

describe('classifyObject', () => {
  it('classifies nested objects', () => {
    const result = classifyObject({
      user: { name: 'John', email: 'john@example.com' },
      settings: { theme: 'dark' },
    });
    expect(result.level).toBe('confidential');
  });

  it('classifies arrays', () => {
    const result = classifyObject({
      users: [
        { email: 'a@test.com' },
        { email: 'b@test.com' },
      ],
    });
    expect(result.level).toBe('confidential');
  });

  it('returns public for clean objects', () => {
    const result = classifyObject({ count: 42, status: 'ok' });
    expect(result.level).toBe('public');
  });
});

describe('maskSensitiveData', () => {
  it('masks email addresses at confidential level', () => {
    const masked = maskSensitiveData('Email: john@example.com', 'confidential');
    expect(masked).toContain('[REDACTED:email]');
    expect(masked).not.toContain('john@example.com');
  });

  it('masks API keys at restricted level', () => {
    const masked = maskSensitiveData('Key: sk_liveABCDEFGHIJKLMNOPQRSTUVWXYZ', 'restricted');
    expect(masked).toContain('[REDACTED:api_key]');
  });

  it('does not mask email at restricted level only', () => {
    // Email is confidential, so it should NOT be masked when only masking restricted
    const masked = maskSensitiveData('Email: john@example.com', 'restricted');
    // The function masks at >= restricted level, so email (confidential) won't be masked
    expect(masked).toContain('john@example.com');
  });

  it('preserves non-sensitive text', () => {
    const original = 'Hello world, this is public.';
    expect(maskSensitiveData(original)).toBe(original);
  });
});

describe('canShareData', () => {
  it('allows sharing at same level', () => {
    expect(canShareData('public', 'public')).toBe(true);
    expect(canShareData('restricted', 'restricted')).toBe(true);
  });

  it('allows sharing from lower to higher classification', () => {
    expect(canShareData('public', 'restricted')).toBe(true);
    expect(canShareData('confidential', 'restricted')).toBe(true);
  });

  it('blocks sharing from higher to lower classification', () => {
    expect(canShareData('restricted', 'public')).toBe(false);
    expect(canShareData('confidential', 'public')).toBe(false);
    expect(canShareData('restricted', 'internal')).toBe(false);
  });
});

describe('classificationReport', () => {
  it('generates a readable report', () => {
    const result = classifyContent('Email: test@example.com');
    const report = classificationReport(result);
    expect(report).toContain('CONFIDENTIAL');
    expect(report).toContain('email');
  });
});

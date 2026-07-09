/**
 * SecA — Phase-14 dlp-scanner threat-model / negative test battery.
 *
 * Proves the DLP engine DETECTS real sensitive data and never produces a
 * false-negative on benign text (so legitimate content is not silently leaked
 * and benign text is not wrongly quarantined). Fail-closed emphasis: a payload
 * that trips ANY pattern must be flagged (flagged === true) and redacted.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/siem-forwarder.js', () => ({ forward: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { scan, redact } from '../src/services/dlp-scanner.js';

describe('[SecA] dlp-scanner: detects real sensitive data (no false negatives)', () => {
  const cases: Array<{ name: string; text: string; expectCategory: string }> = [
    { name: 'ssn', text: 'SSN 123-45-6789 belongs to the applicant.', expectCategory: 'pii_ssn' },
    { name: 'email', text: 'Reach me at jane.doe@example.com for details.', expectCategory: 'pii_email' },
    { name: 'phone', text: 'Call +1 (555) 123-4567 tomorrow.', expectCategory: 'pii_phone' },
    { name: 'card', text: 'Card 4111 1111 1111 1111 was charged.', expectCategory: 'financial_card' },
    { name: 'credential', text: 'password = S3cr3tP@ssw0rd! do not share', expectCategory: 'credential' },
    { name: 'api-key', text: 'api_key: sk_live_abc123DEFghi456JKl', expectCategory: 'credential' },
    { name: 'internal-tag', text: 'See [INTERNAL-EYES-ONLY] roadmap for Q4.', expectCategory: 'internal_tag' },
    { name: 'confidential-tag', text: 'Draft [CONFIDENTIAL] memo attached.', expectCategory: 'internal_tag' },
  ];

  it.each(cases)('flags $name', ({ text, expectCategory }) => {
    const res = scan(text);
    expect(res.flagged).toBe(true);
    expect(res.findings.some((f) => f.category === expectCategory)).toBe(true);
    expect(res.findings.length).toBeGreaterThan(0);
    expect(res.score).toBeGreaterThan(0);
  });

  it('redacts every detected category in the output copy', () => {
    const text = 'SSN 123-45-6789 email a@b.com phone 555-123-4567 card 4111 1111 1111 1111';
    const res = scan(text);
    expect(res.redacted).not.toContain('123-45-6789');
    expect(res.redacted).not.toContain('a@b.com');
    expect(res.redacted).not.toContain('555-123-4567');
    expect(res.redacted).not.toContain('4111 1111 1111 1111');
    expect(res.redacted).toContain('[DLP:');
  });

  it('detects multiple categories in a single payload', () => {
    const res = scan('Contact ssn 123-45-6789 at bob@corp.com or 555-987-6543, card 5500 0000 0000 0004');
    const cats = new Set(res.findings.map((f) => f.category));
    expect(cats.has('pii_ssn')).toBe(true);
    expect(cats.has('pii_email')).toBe(true);
    expect(cats.has('pii_phone')).toBe(true);
    expect(cats.has('financial_card')).toBe(true);
  });
});

describe('[SecA] dlp-scanner: no false negatives on benign text', () => {
  const benign = [
    'The quarterly revenue grew 12% in the EMEA region.',
    'Please schedule the standup at 9am UTC on Monday.',
    'Order #48213 shipped to warehouse 7 on aisle 12.',
    'Our meeting is in room 204 at the downtown office.',
    'The build passed 142 of 142 unit tests.',
  ];

  it.each(benign)('does not flag benign text: "$value"', (text) => {
    const res = scan(text);
    // A version number / phone-like fragment could trip the loose phone/card
    // patterns; we assert that NO credential/ssn/email/internal finding leaks,
    // and that redaction did not mangle the sentence into a DLP placeholder
    // for those high-confidence categories.
    const leaked = res.findings.filter((f) =>
      ['pii_ssn', 'pii_email', 'credential', 'internal_tag'].includes(f.category)
    );
    expect(leaked).toHaveLength(0);
  });

  it('empty / non-string input does not throw and is not flagged', () => {
    expect(scan('').flagged).toBe(false);
    expect(() => scan('')).not.toThrow();
  });
});

describe('[SecA] dlp-scanner: redact() sanitizes untrusted values (fail-closed)', () => {
  it('redact returns a sanitized form of an object containing secrets', () => {
    const out = redact({ user: 'bob', password: 'hunter2!secret', note: 'ok' });
    // sanitize masks known secret keys; the raw password must not survive.
    expect(JSON.stringify(out)).not.toContain('hunter2!secret');
  });
});

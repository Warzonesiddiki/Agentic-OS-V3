/**
 * lib/security-headers.test.ts — Unit tests for security headers utility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { securityHeaders } from '../../src/lib/security-headers.js';
import { getEnv } from '../../src/lib/env.js';

vi.mock('../../src/lib/env.js', () => ({
  getEnv: vi.fn(),
}));

describe('security-headers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return basic security headers in development', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'development' });

    const headers = securityHeaders();
    expect(headers).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' ; style-src 'self' ; img-src 'self' data: https:; font-src 'self'; connect-src 'self'",
      'Permissions-Policy':
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    });
  });

  it('should include HSTS header in production', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'production' });

    const headers = securityHeaders();
    expect(headers).toHaveProperty(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  });

  it('should NOT include HSTS header in development', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'development' });

    const headers = securityHeaders();
    expect(headers).not.toHaveProperty('Strict-Transport-Security');
  });

  it('should include nonce in CSP when provided', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'development' });

    const nonce = 'test-nonce-123';
    const headers = securityHeaders(nonce);
    expect(headers['Content-Security-Policy']).toContain(`'nonce-${nonce}'`);
  });

  it('should not include nonce in CSP when not provided', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'development' });

    const headers = securityHeaders();
    expect(headers['Content-Security-Policy']).not.toContain("'nonce-");
  });

  it('should include https: in connect-src when NEXUS_API_KEY is set', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({
      NODE_ENV: 'development',
      NEXUS_API_KEY: 'test-key',
    });

    const headers = securityHeaders();
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self' https:");
  });

  it('should not include https: in connect-src when NEXUS_API_KEY is not set', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({
      NODE_ENV: 'development',
    });

    const headers = securityHeaders();
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self'");
    const connectSrc = headers['Content-Security-Policy']!.split(';').find((part) =>
      part.trim().startsWith('connect-src')
    );
    expect(connectSrc).toBeDefined();
    expect(connectSrc).not.toContain('https:');
  });

  it('should include both script and style nonces when nonce is provided', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({ NODE_ENV: 'development' });

    const nonce = 'abc123';
    const headers = securityHeaders(nonce);
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).toContain("style-src 'self' 'nonce-abc123'");
  });

  it('should return same headers shape every time for same env', () => {
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValue({
      NODE_ENV: 'test',
      NEXUS_API_KEY: 'key-1',
    });

    const a = securityHeaders();
    const b = securityHeaders();
    expect(a).toEqual(b);
  });
});

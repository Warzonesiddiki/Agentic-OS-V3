import { getEnv } from './env.js';

/**
 * Get security headers with request-specific CSP nonce.
 * @param nonce CSP script/style nonce
 * @returns {Record<string, string>} Headers object
 */
export function securityHeaders(nonce?: string): Record<string, string> {
  const env = getEnv();
  
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  if (env.NODE_ENV === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  // Content Security Policy - nonce based, denies inline and eval
  const nonceDirective = nonce ? `'nonce-${nonce}'` : '';
  let csp = `default-src 'self'; `;
  csp += `script-src 'self' ${nonceDirective}; `;
  csp += `style-src 'self' ${nonceDirective}; `;
  csp += `img-src 'self' data: https:; `;
  csp += `font-src 'self'; `;
  csp += `connect-src 'self' `;
  
  if (env.NEXUS_API_KEY) {
    csp += `https: `;
  }
  
  csp = csp.trimEnd().replace(/;\s*$/, '');
  headers['Content-Security-Policy'] = csp;
  
  headers['Permissions-Policy'] = [
    'accelerometer=()',
    'camera=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'payment=()',
    'usb=()'
  ].join(', ');

  return headers;
}

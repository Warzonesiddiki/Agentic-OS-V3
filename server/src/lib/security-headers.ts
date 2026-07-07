import { getEnv } from './env.js';

/**
 * Get security headers apply all responses.
 * @param nonce Optional CSP nonce
 * @returns {Record<string, string>} Headers object
 */
export function securityHeaders(nonce?: string): Record<string, string> {
  const env = getEnv();
  
  const headers: Record<string, string> = {
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',
    
    // Enable XSS protection (legacy but still useful)
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  // Add HSTS in production
  if (env.NODE_ENV === 'production') {
    // Max age: 1 year in seconds
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  // Content Security Policy
  let csp = "default-src 'self'; ";
  
  // Script and Style sources with optional nonce
  if (nonce) {
    csp += `script-src 'self' 'nonce-${nonce}'; `;
    csp += `style-src 'self' 'nonce-${nonce}'; `;
  } else {
    csp += "script-src 'self'; ";
    csp += "style-src 'self'; ";
  }
  
  // Image sources
  csp += "img-src 'self' data: https:; ";
  
  // Font sources
  csp += "font-src 'self'; ";
  
  // Connect sources (for AJAX, WebSockets, EventSource)
  csp += "connect-src 'self' ";
  
  // Add API endpoints if needed
  if (env.NEXUS_API_KEY) {
    csp += "https: "; // Allow API calls to external services
  }
  
  // Remove trailing semicolon and space
  csp = csp.trimEnd().replace(/;\s*$/, '');
  
  headers['Content-Security-Policy'] = csp;
  
  // Permissions Policy (formerly Feature Policy)
  // Restrict potentially dangerous features
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

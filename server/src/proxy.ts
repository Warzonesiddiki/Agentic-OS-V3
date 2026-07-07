/**
 * proxy.ts — perimeter middleware functions.
 * Extracted from app.ts for modularity and testability.
 */

import { randomBytes } from 'node:crypto';
import { env } from './lib/env.js';
import { securityHeaders as getSecurityHeaders } from './lib/security-headers.js';
import { generateUuid } from './lib/utils/id.js';
import { consume, consumePrincipal, clientIpFromHeaders } from './lib/rate-limit.js';
import { createPayloadLimitMiddleware } from './lib/payload-limit.js';
import { authenticate } from './lib/security.js';
import { db } from './db/client.js';
import type { Context } from 'hono';

/**
 * Generate a unique request ID for tracing.
 */
export async function requestId(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const reqId = c.req.header('x-request-id') ?? generateUuid();
  c.set('requestId', reqId);
  return await next();
}

/**
 * Apply security headers to all responses.
 */
export async function securityHeaders(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const nonce = randomBytes(16).toString('hex');
  c.set('cspNonce', nonce);
  await next();
  const headers = getSecurityHeaders(nonce);
  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }
}

/**
 * Set security headers (alias for clarity in app.ts).
 */
export function setSecurityHeaders(c: Context): void {
  const nonce = c.get('cspNonce') ?? '';
  const headers = getSecurityHeaders(nonce);
  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }
}

/**
 * CORS middleware.
 */
export async function cors(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const origin = c.req.header('origin') ?? '';
  const allowedOrigins = env.NEXUS_ALLOWED_ORIGINS.split(',').map(o => o.trim());
  
  // Check if origin is allowed
  const isAllowed = allowedOrigins.some(allowed => 
    allowed === '*' || allowed === origin
  );
  
  if (isAllowed) {
    // Set CORS headers
    c.header('Access-Control-Allow-Origin', origin || '*');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
    c.header('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
  }
  
  return await next();
}

/**
 * Rate limiting middleware.
 */
export async function rateLimit(c: Context, next: () => Promise<void>): Promise<void | Response> {
  // Skip rate limiting for OPTIONS requests (handled by CORS)
  if (c.req.method === 'OPTIONS') {
    return await next();
  }
  
  // Convert Headers instance to Record<string, string>
  const headersRecord: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  // Extract client IP with proxy support
  const ip = clientIpFromHeaders(headersRecord);
  
  // Determine rate limit type based on path
  const route = c.req.path.startsWith('/api/events') ? 'sse' : undefined;
  
  // Apply rate limit per authenticated principal, otherwise fallback to IP
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let principalId: string | undefined;
  if (token) {
    try {
      const principal = await authenticate(db, token);
      if (principal) {
        principalId = principal.id;
      }
    } catch {
      // ignore
    }
  }

  const result = principalId
    ? await consumePrincipal(principalId, route)
    : await consume(ip, route);

  if (!result.allowed) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later.',
        },
      },
      429
    );
  }

  // Set rate limit headers
  const multiplier = principalId ? 5 : 1;
  c.header('X-RateLimit-Limit', (multiplier * (route === 'sse' ? Number(env.NEXUS_RATE_LIMIT_SSE_PER_MINUTE) : Number(env.NEXUS_RATE_LIMIT_PER_MINUTE))).toString());
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', String(Date.now() + result.resetMs));
  
  return await next();
}

/**
 * Payload size limit middleware.
 */
export const payloadLimit = createPayloadLimitMiddleware();

/**
 * Auth backstop middleware.
 * Validates API key for mutating requests (POST, PUT, PATCH, DELETE).
 */
export async function authBackstop(c: Context, next: () => Promise<void>): Promise<void | Response> {
  // Skip auth for safe methods: GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return await next();
  }
  
  // Extract bearer token from Authorization header
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  
  if (!token) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      },
      401
    );
  }
  
  // Verify the API key using the shared database instance
  const principal = await authenticate(db, token);
  
  if (!principal) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key.',
        },
      },
      401
    );
  }
  
  // Store principal in context for later use
  c.set('principal', principal);
  
  return await next();
}

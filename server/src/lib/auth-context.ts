/**
 * auth-context.ts — per-request principal + scope enforcement.
 */
import type { Context } from 'hono';
import {
  authenticate,
  hasScope,
  type Principal,
  type Scope,
} from './security.js';
export type { Scope } from './security.js';
import { db } from '../db/client.js';
import { err } from './envelope.js';
import { ApiError } from './errors.js';
import type { NexusEnv } from './hono-env.js';

export async function resolvePrincipal(c: Context<NexusEnv>): Promise<Principal | null> {
  // Reuse the principal the auth backstop already resolved (mutations), instead
  // of re-running the (expensive, scrypt-based) authenticator a second time.
  const cached = c.get('principal');
  if (cached !== undefined) return cached;
  const key =
    c.req
      .header('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() ?? null;
  return authenticate(db, key);
}

export async function requireScope(c: Context, scope: Scope) {
  const principal = await resolvePrincipal(c);
  if (!principal) throw new ApiError('UNAUTHORIZED', 'Authentication required.');
  if (!hasScope(principal.scopes, scope))
    throw new ApiError('FORBIDDEN', `Missing required scope: ${scope}`);
  return principal;
}

export async function safeJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body is not valid JSON.');
  }
}

export function parse<T>(schema: import('zod').ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ApiError('VALIDATION_ERROR', msg);
  }
  return r.data;
}

export function fail(c: Context, e: unknown) {
  const traceId = c.get('requestId') ?? '';
  if (e instanceof ApiError) {
    return c.json(
      err(e.code, e.message, traceId, e.status),
      e.status as Parameters<typeof c.json>[1]
    );
  }
  const msg = e instanceof Error ? e.message : 'Internal error';
  return c.json(err('INTERNAL_ERROR', msg, traceId), 500);
}

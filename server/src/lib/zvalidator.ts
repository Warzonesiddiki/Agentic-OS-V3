/**
 * Local re-implementation of `@hono/zod-validator`'s `zValidator` helper.
 *
 * The published package is NOT in the installed dependency set (and cannot be
 * added at agent-runtime), but Phase 17 routes rely on its `zValidator` +
 * `c.req.valid(...)` surface. This shim provides the same runtime behavior and
 * a compatible type augmentation so the route handlers compile and run.
 */

import type { Context, MiddlewareHandler, ValidationTargets } from 'hono';
import { type ZodTypeAny } from 'zod';

declare module 'hono' {
  interface HonoRequest {
    /** Returns runtime-Zod-validated data; Hono's augmentation requires an erased return type. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Compatibility boundary mirrors Hono's target-dependent valid() API.
    valid(target: keyof ValidationTargets): any;
  }
}

type ValidStore = Partial<Record<keyof ValidationTargets, unknown>>;

function readTarget(c: Context, target: keyof ValidationTargets): unknown {
  switch (target) {
    case 'json':
      return c.req.json().catch(() => ({}));
    case 'query':
      return c.req.query();
    case 'param':
      return c.req.param();
    case 'header':
      return c.req.header();
    case 'form':
      return c.req.formData().catch(() => ({}));
    default:
      return {};
  }
}

export function zValidator(target: keyof ValidationTargets, schema: ZodTypeAny): MiddlewareHandler {
  return async (c, next) => {
    const raw = await readTarget(c, target);
    const result = schema.safeParse(raw);
    if (!result.success) {
      return c.json({ error: 'validation_failed', issues: result.error.issues }, 400);
    }
    const store = ((c.req as unknown as { _valid?: ValidStore })._valid ??= {}) as ValidStore;
    store[target] = result.data;
    const req = c.req as unknown as {
      valid: (t: keyof ValidationTargets) => unknown;
    };
    req.valid = (t: keyof ValidationTargets) => store[t] ?? store[target];
    await next();
  };
}

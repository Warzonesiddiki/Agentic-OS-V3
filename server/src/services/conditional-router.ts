/**
 * conditional-router.ts — Phase 13.10 conditional branching / router (PURE).
 *
 * Evaluates a safe predicate DSL (NO eval / no arbitrary code) against the
 * blackboard + trigger context to decide which downstream step(s) to activate.
 * Predicates are { field, op, value } tuples resolved against a flat context.
 */
import { z } from 'zod';
import { log } from '../lib/logging.js';

export const RouterOpSchema = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'truthy',
  'exists',
]);
export type RouterOp = z.infer<typeof RouterOpSchema>;

export const ConditionSchema = z.object({
  field: z.string().min(1),
  op: RouterOpSchema,
  value: z.unknown().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export interface RouteRule {
  when: Condition;
  then: string;
}

export const RouteRuleSchema = z.object({
  when: ConditionSchema,
  then: z.string().min(1),
});

/** Resolve a dotted field path against a context object. */
export function resolveField(ctx: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, ctx);
}

export function evalCondition(cond: Condition, ctx: Record<string, unknown>): boolean {
  const actual = resolveField(ctx, cond.field);
  switch (cond.op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'truthy':
      return Boolean(actual);
    case 'eq':
      return actual === cond.value;
    case 'ne':
      return actual !== cond.value;
    case 'gt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;
    case 'gte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual >= cond.value;
    case 'lt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;
    case 'lte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual <= cond.value;
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(actual as never);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(cond.value as never);
      if (typeof actual === 'string' && typeof cond.value === 'string')
        return actual.includes(cond.value);
      return false;
    default:
      return false;
  }
}

/**
 * Evaluate routing rules against context. Returns the list of downstream step
 * ids whose `when` matched. A `default` rule (when.field='*', op='truthy') is
 * honored last if nothing else matched. Caller must guarantee at least one
 * match (design: every DAG router has a default branch — enforced by workflow-dsl).
 */
export function route(rules: RouteRule[], ctx: Record<string, unknown>): string[] {
  const hits: string[] = [];
  let defaultHit: string | undefined;
  for (const r of rules) {
    if (r.when.field === '*' && r.when.op === 'truthy') {
      defaultHit = r.then;
      continue;
    }
    if (evalCondition(r.when, ctx)) hits.push(r.then);
  }
  if (hits.length === 0 && defaultHit) hits.push(defaultHit);
  log.debug('router.eval', { matched: hits.length });
  return hits;
}

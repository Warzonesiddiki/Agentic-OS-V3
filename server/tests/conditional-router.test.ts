import { describe, it, expect } from 'vitest';
import {
  evalCondition,
  route,
  resolveField,
  type RouteRule,
} from '../src/services/conditional-router.js';

describe('conditional-router', () => {
  const ctx = { score: 8, tags: ['a', 'b'], ok: true, nested: { v: 3 } };

  it('resolves dotted fields', () => {
    expect(resolveField(ctx, 'nested.v')).toBe(3);
  });

  it('evaluates comparison ops', () => {
    expect(evalCondition({ field: 'score', op: 'gte', value: 5 }, ctx)).toBe(true);
    expect(evalCondition({ field: 'score', op: 'lt', value: 5 }, ctx)).toBe(false);
  });

  it('evaluates contains / in', () => {
    expect(evalCondition({ field: 'tags', op: 'contains', value: 'a' }, ctx)).toBe(true);
    expect(evalCondition({ field: 'score', op: 'in', value: [1, 8, 9] }, ctx)).toBe(true);
  });

  it('evaluates truthy / exists', () => {
    expect(evalCondition({ field: 'ok', op: 'truthy' }, ctx)).toBe(true);
    expect(evalCondition({ field: 'missing', op: 'exists' }, ctx)).toBe(false);
  });

  it('routes with default fallback', () => {
    const rules: RouteRule[] = [
      { when: { field: 'score', op: 'gte', value: 90 }, then: 'premium' },
      { when: { field: '*', op: 'truthy' }, then: 'standard' },
    ];
    expect(route(rules, ctx)).toEqual(['standard']);
    expect(route(rules, { ...ctx, score: 95 })).toEqual(['premium']);
  });

  it('returns multiple hits when several match', () => {
    const rules: RouteRule[] = [
      { when: { field: 'tags', op: 'contains', value: 'a' }, then: 'A' },
      { when: { field: 'tags', op: 'contains', value: 'b' }, then: 'B' },
    ];
    expect(route(rules, ctx).sort()).toEqual(['A', 'B']);
  });
});

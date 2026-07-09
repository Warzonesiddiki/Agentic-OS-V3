/**
 * services/omniroute.test.ts — Unit tests for the OmniRoute integration bridge.
 * Pure: mocks the omniroute-bridge health surface. No DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const healthyCatalog: Record<string, { provider: string; tier: string; costPer1K?: number }> = {
  'gpt-4o': { provider: 'openai', tier: 'flagship' },
  'gpt-4o-mini': { provider: 'openai', tier: 'fast' },
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', tier: 'flagship' },
  'gemini-1.5-flash': { provider: 'google', tier: 'fast', costPer1K: 0.0001 },
};

vi.mock('../../src/services/omniroute-bridge.js', () => ({
  MODEL_TIER_CATALOG: healthyCatalog,
  getProviderHealth: vi.fn((p: string) => ({ status: 'healthy', consecutive5xxCount: 0, provider: p })),
  isProviderHealthy: vi.fn((p: string) => p !== 'down-provider'),
}));

import {
  GuardrailRegistry,
  BaseGuardrail,
  SkillRegistry,
  resolveComboModel,
  fallbackPolicy,
  registerFallback,
  resolveFallback,
  runPipeline,
  computeCost,
  checkDegradation,
  routeByTag,
  assess,
} from '../../src/services/omniroute.js';
import { getProviderHealth, isProviderHealthy } from '../../src/services/omniroute-bridge.js';

beforeEach(() => vi.clearAllMocks());

describe('GuardrailRegistry', () => {
  it('runs all guards and reports allPassed=false when one fails', async () => {
    class Allow extends BaseGuardrail {
      async check() {
        return { passed: true };
      }
    }
    class Deny extends BaseGuardrail {
      async check() {
        return { passed: false, reason: 'blocked' };
      }
    }
    const reg = new GuardrailRegistry();
    reg.register('a', new Allow());
    reg.register('b', new Deny());
    const res = await reg.checkAll({ content: 'x' });
    expect(res.results).toHaveLength(2);
    expect(res.allPassed).toBe(false);
  });

  it('returns allPassed=true when every guard passes', async () => {
    class Ok extends BaseGuardrail {
      async check() {
        return { passed: true };
      }
    }
    const reg = new GuardrailRegistry();
    reg.register('a', new Ok());
    const res = await reg.checkAll({ content: 'x' });
    expect(res.allPassed).toBe(true);
  });
});

describe('SkillRegistry', () => {
  it('registers, retrieves and lists skills', () => {
    const reg = new SkillRegistry();
    const exec = { execute: async () => 42 } as any;
    reg.register({ id: 's1', name: 'Skill One' }, exec);
    expect(reg.get('s1')).toBe(exec);
    expect(reg.list()).toEqual([{ id: 's1', name: 'Skill One' }]);
  });

  it('returns undefined for unknown skill', () => {
    const reg = new SkillRegistry();
    expect(reg.get('nope')).toBeUndefined();
  });
});

describe('resolveComboModel', () => {
  it('returns the first healthy model from the list', async () => {
    const m = await resolveComboModel(['down-provider-model', 'gpt-4o', 'gpt-4o-mini']);
    expect(m).toBe('gpt-4o'); // down-provider-model unhealthy, gpt-4o healthy
  });

  it('falls back to the first model when none healthy', async () => {
    (isProviderHealthy as any).mockReturnValue(false);
    const m = await resolveComboModel(['a', 'b']);
    expect(m).toBe('a');
  });
});

describe('fallbackPolicy', () => {
  it('returns registered fallback when healthy', async () => {
    registerFallback('gpt-4o', 'gpt-4o-mini');
    const m = await fallbackPolicy('gpt-4o');
    expect(m).toBe('gpt-4o-mini');
  });

  it('returns gpt-4o-mini for flagship tier when no healthy fallback', async () => {
    (isProviderHealthy as any).mockReturnValue(false); // fallback unhealthy
    const m = await fallbackPolicy('gpt-4o');
    expect(m).toBe('gpt-4o-mini');
  });

  it('returns gemini-1.5-flash for non-flagship tier', async () => {
    (isProviderHealthy as any).mockReturnValue(false);
    const m = await fallbackPolicy('gpt-4o-mini');
    expect(m).toBe('gemini-1.5-flash');
  });
});

describe('resolveFallback', () => {
  it('returns registered fallback or default', async () => {
    registerFallback('x', 'y');
    expect(await resolveFallback('x')).toBe('y');
    expect(await resolveFallback('z')).toBe('gpt-4o-mini');
  });
});

describe('runPipeline', () => {
  it('applies stages in order', async () => {
    const out = await runPipeline(
      {
        stages: [
          { name: 'up', handler: async (i: any) => i + 1 },
          { name: 'dbl', handler: async (i: any) => i * 2 },
        ],
      },
      1,
    );
    expect(out).toBe(4);
  });
});

describe('computeCost', () => {
  it('uses catalog costPer1K when available', () => {
    const c = computeCost({ provider: 'google', model: 'gemini-1.5-flash', tokens: 1000 });
    expect(c.total).toBeCloseTo(0.0001, 6);
    expect(c.currency).toBe('usd');
  });

  it('falls back to default 0.001 rate', () => {
    const c = computeCost({ provider: 'unknown', model: 'weird', tokens: 2000 });
    expect(c.total).toBeCloseTo(0.002, 6);
  });
});

describe('checkDegradation', () => {
  it('reports degraded when provider is down', async () => {
    (getProviderHealth as any).mockReturnValue({ status: 'down', consecutive5xxCount: 3, provider: 'p' });
    const r = await checkDegradation({ provider: 'p', model: 'm', tokens: 1 });
    expect(r.degraded).toBe(true);
    expect(r.reason).toContain('down');
  });

  it('reports degraded when provider is degraded', async () => {
    (getProviderHealth as any).mockReturnValue({ status: 'degraded', consecutive5xxCount: 1, provider: 'p' });
    const r = await checkDegradation({ provider: 'p', model: 'm', tokens: 1 });
    expect(r.degraded).toBe(true);
  });

  it('reports not degraded when healthy', async () => {
    (getProviderHealth as any).mockReturnValue({ status: 'healthy', consecutive5xxCount: 0, provider: 'p' });
    const r = await checkDegradation({ provider: 'p', model: 'm', tokens: 1 });
    expect(r.degraded).toBe(false);
  });
});

describe('routeByTag', () => {
  it('routes fast/cheap tags to gemini-flash', async () => {
    expect(await routeByTag('fast-track')).toEqual({ tag: 'fast-track', provider: 'google', model: 'gemini-1.5-flash' });
    expect(await routeByTag('cheap')).toEqual({ tag: 'cheap', provider: 'google', model: 'gemini-1.5-flash' });
  });

  it('routes code/reasoning tags to claude', async () => {
    expect(await routeByTag('code-gen')).toEqual({ tag: 'code-gen', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' });
  });

  it('defaults to gpt-4o-mini', async () => {
    expect(await routeByTag('misc')).toEqual({ tag: 'misc', provider: 'openai', model: 'gpt-4o-mini' });
  });
});

describe('assess', () => {
  it('returns quality score 1 for short content', async () => {
    const r = await assess('short', 'quality');
    expect(r.score).toBe(1.0);
    expect(r.category).toBe('quality');
  });

  it('penalizes long content when category is cost', async () => {
    const r = await assess('x'.repeat(6000), 'cost');
    expect(r.score).toBe(0.5);
    expect(r.details.contentLength).toBe(6000);
  });

  it('defaults category to quality', async () => {
    const r = await assess('hi');
    expect(r.category).toBe('quality');
  });
});

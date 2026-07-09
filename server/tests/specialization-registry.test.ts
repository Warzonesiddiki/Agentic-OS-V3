import { describe, it, expect } from 'vitest';
import {
  SpecializationRegistry,
  type RegisteredAgent,
} from '../src/services/specialization-registry.js';
import type { AgentCapability } from '@agentic-os/a2a-server';

function agent(
  partial: Partial<RegisteredAgent> & { agentId: string; capability: AgentCapability }
): RegisteredAgent {
  return {
    version: '1.0.0',
    reputation: 0.9,
    costTier: 2,
    load: 0.1,
    available: true,
    ...partial,
  };
}

const cap = (name: string, domain: AgentCapability['domain'] = 'Dev'): AgentCapability => ({
  name,
  domain,
  category: 'read',
  sideEffects: ['env.read'],
  scopes: ['*'],
  failureMode: 'fail-closed',
});

describe('specialization-registry', () => {
  it('ranks by reputation then cost then load', () => {
    const r = new SpecializationRegistry();
    r.register(
      agent({
        agentId: 'low',
        capability: cap('memory.search'),
        reputation: 0.5,
        costTier: 1,
        load: 0.1,
      })
    );
    r.register(
      agent({
        agentId: 'high',
        capability: cap('memory.search'),
        reputation: 0.95,
        costTier: 3,
        load: 0.2,
      })
    );
    const ranked = r.match({ capability: 'memory.search' });
    expect(ranked[0]!.agentId).toBe('high');
  });

  it('filters by minReputation / maxCostTier', () => {
    const r = new SpecializationRegistry();
    r.register(
      agent({ agentId: 'cheap', capability: cap('memory.search'), reputation: 0.4, costTier: 1 })
    );
    r.register(
      agent({ agentId: 'good', capability: cap('memory.search'), reputation: 0.95, costTier: 4 })
    );
    expect(
      r.match({ capability: 'memory.search', minReputation: 0.8 }).map((a) => a.agentId)
    ).toEqual(['good']);
    expect(r.match({ capability: 'memory.search', maxCostTier: 2 }).map((a) => a.agentId)).toEqual([
      'cheap',
    ]);
  });

  it('skips unavailable agents', () => {
    const r = new SpecializationRegistry();
    r.register(agent({ agentId: 'down', capability: cap('memory.search'), available: false }));
    expect(r.pick({ capability: 'memory.search' })).toBeUndefined();
  });

  it('costOptimized biases toward cheaper', () => {
    const r = new SpecializationRegistry();
    r.register(agent({ agentId: 'pricey', capability: cap('x'), reputation: 0.99, costTier: 5 }));
    r.register(agent({ agentId: 'budget', capability: cap('x'), reputation: 0.9, costTier: 1 }));
    expect(r.match({ capability: 'x', costOptimized: true })[0]!.agentId).toBe('budget');
  });

  it('rejects bad capability/version on register', () => {
    const r = new SpecializationRegistry();
    expect(() =>
      r.register(
        agent({
          agentId: 'bad',
          capability: { ...cap('x'), domain: 'Nope' as never },
          version: 'not-semver',
        })
      )
    ).toThrow();
  });
});

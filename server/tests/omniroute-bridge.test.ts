import { describe, it, expect } from 'vitest';
import {
  classifyComplexity,
  resolveOmniRoute,
  recordProviderFailure,
  recordProviderSuccess,
  getProviderHealth,
  isProviderHealthy,
  is5xxOrTransientError,
  MODEL_TIER_CATALOG,
} from '../src/services/omniroute-bridge.js';

describe('OmniRoute Intelligent Fallback & Dynamic Routing Engine', () => {
  it('classifies task complexity into simple, medium, and complex tiers under 5ms', () => {
    const simpleReq = {
      model: 'auto',
      messages: [{ role: 'user' as const, content: 'Hi, hello world!' }],
    };

    const complexReq = {
      model: 'auto',
      messages: [
        {
          role: 'user' as const,
          content:
            'Refactor and optimize this algorithm step-by-step with complete code blocks:\n```ts\nfunction solve() {}\n```',
        },
      ],
    };

    const visionReq = {
      model: 'auto',
      messages: [{ role: 'user' as const, content: 'Describe image' }],
      requires: ['vision' as const],
    };

    const start = performance.now();
    const simpleComplexity = classifyComplexity(simpleReq);
    const complexComplexity = classifyComplexity(complexReq);
    const visionComplexity = classifyComplexity(visionReq);
    const durationMs = performance.now() - start;

    expect(simpleComplexity).toBe('simple');
    expect(complexComplexity).toBe('complex');
    expect(visionComplexity).toBe('complex');
    expect(durationMs).toBeLessThan(5);
  });

  it('routes simple tasks to mini/flash models and complex tasks to flagship models', () => {
    const simpleDecision = resolveOmniRoute({
      model: 'auto',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const complexDecision = resolveOmniRoute({
      model: 'auto',
      messages: [
        {
          role: 'user',
          content: 'Refactor the architecture of this distributed system step-by-step',
        },
      ],
    });

    expect(simpleDecision.complexity).toBe('simple');
    expect(['mini', 'flash']).toContain(MODEL_TIER_CATALOG[simpleDecision.chosenModel]?.tier);
    expect(simpleDecision.evaluationTimeMs).toBeLessThan(5);

    expect(complexDecision.complexity).toBe('complex');
    expect(['flagship', 'standard']).toContain(
      MODEL_TIER_CATALOG[complexDecision.chosenModel]?.tier
    );
    expect(complexDecision.evaluationTimeMs).toBeLessThan(5);
  });

  it('tracks provider health dynamically on 5xx errors and updates status', () => {
    const testProvider = 'test-provider-5xx';

    expect(isProviderHealthy(testProvider)).toBe(true);

    recordProviderFailure(testProvider, 503, 'Service Unavailable');
    let health = getProviderHealth(testProvider);
    expect(health.status).toBe('degraded');

    recordProviderFailure(testProvider, 500, 'Internal Server Error');
    recordProviderFailure(testProvider, 502, 'Bad Gateway');
    health = getProviderHealth(testProvider);
    expect(health.status).toBe('down');
    expect(isProviderHealthy(testProvider)).toBe(false);

    recordProviderSuccess(testProvider, 120);
    health = getProviderHealth(testProvider);
    expect(health.status).toBe('healthy');
    expect(isProviderHealthy(testProvider)).toBe(true);
  });

  it('correctly detects HTTP 5xx and transient errors', () => {
    const err503 = new Error('openai_503: Service overloaded');
    const err500 = new Error('anthropic_500: Internal server error');
    const netErr = new Error('fetch failed: ETIMEDOUT');
    const err400 = new Error('openai_400: Invalid payload');

    expect(is5xxOrTransientError(err503).is5xx).toBe(true);
    expect(is5xxOrTransientError(err500).is5xx).toBe(true);
    expect(is5xxOrTransientError(netErr).is5xx).toBe(true);
    expect(is5xxOrTransientError(err400).is5xx).toBe(false);
  });
});

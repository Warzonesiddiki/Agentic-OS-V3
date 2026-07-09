/**
 * services/llm-router.test.ts — Unit tests for the complexity-aware LLM router.
 *
 * Strategy: mock the three runtime collaborators (env, token estimator, and the
 * underlying trajectory LLM client) so the router is exercised in isolation with
 * deterministic complexity classification. No network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/env.js', () => ({
  getEnv: vi.fn(() => ({})),
}));
vi.mock('../../src/lib/tokens.js', () => ({
  estimateTokens: vi.fn((s: string) => Math.ceil((s?.length ?? 0) / 4)),
}));
vi.mock('../../src/services/llm-client.js', () => ({
  callLLMWithTrajectory: vi.fn(),
}));

import { callRoutedLLM } from '../../src/services/llm-router.js';
import { getEnv } from '../../src/lib/env.js';
import { estimateTokens } from '../../src/lib/tokens.js';
import { callLLMWithTrajectory } from '../../src/services/llm-client.js';

const mockGetEnv = vi.mocked(getEnv);
const mockEstimate = vi.mocked(estimateTokens);
const mockCall = vi.mocked(callLLMWithTrajectory);

function fakeResp(model: string) {
  return {
    content: `reply-from-${model}`,
    model,
    usage: { prompt: 1, completion: 2, total: 3 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEnv.mockReturnValue({});
  mockCall.mockImplementation(async (req: any) => fakeResp(req.model));
  mockEstimate.mockImplementation((s: string) => Math.max(1, Math.ceil((s?.length ?? 0) / 4)));
});

describe('callRoutedLLM — complexity classification & model selection', () => {
  it('routes a short query with tiny context to the simple tier', async () => {
    const r = await callRoutedLLM('hi', '', 'sys', { agentId: 'a1' });
    expect(r.model).toBe('gpt-4o-mini');
    const reqArg = mockCall.mock.calls[0][0];
    expect(reqArg.model).toBe('gpt-4o-mini');
    expect(reqArg.maxTokens).toBe(1024);
    expect(reqArg.temperature).toBe(0.3);
    expect(mockCall.mock.calls[0][1].circuitBreakerKey).toBe('routed:a1:simple:gpt-4o-mini');
  });

  it('routes to the medium tier when query length exceeds 500', async () => {
    const r = await callRoutedLLM('x'.repeat(600), '', 'sys', { agentId: 'a2' });
    expect(r.model).toBe('gpt-4o');
    const reqArg = mockCall.mock.calls[0][0];
    expect(reqArg.maxTokens).toBe(4096);
    expect(reqArg.temperature).toBe(0.7);
    expect(mockCall.mock.calls[0][1].circuitBreakerKey).toBe('routed:a2:medium:gpt-4o');
  });

  it('routes to the complex tier when query length exceeds 2000', async () => {
    const r = await callRoutedLLM('x'.repeat(2500), '', 'sys', { agentId: 'a3' });
    expect(r.model).toBe('gpt-4o');
    const reqArg = mockCall.mock.calls[0][0];
    expect(reqArg.maxTokens).toBe(8192);
    expect(mockCall.mock.calls[0][1].circuitBreakerKey).toBe('routed:a3:complex:gpt-4o');
  });

  it('routes to complex when context tokens exceed 6000', async () => {
    mockEstimate.mockReturnValue(6001);
    const r = await callRoutedLLM('short', 'c'.repeat(24004), 'sys', { agentId: 'a4' });
    expect(r.model).toBe('gpt-4o');
    expect(mockCall.mock.calls[0][1].circuitBreakerKey).toBe('routed:a4:complex:gpt-4o');
  });

  it('routes to medium when context tokens exceed 2000 but below 6000', async () => {
    mockEstimate.mockReturnValue(3000);
    const r = await callRoutedLLM('short', 'c'.repeat(12000), 'sys', { agentId: 'a4b' });
    expect(r.model).toBe('gpt-4o');
    expect(mockCall.mock.calls[0][1].circuitBreakerKey).toBe('routed:a4b:medium:gpt-4o');
  });
});

describe('callRoutedLLM — explicit config override', () => {
  it('honours a provided RouterConfig (simpleModel)', async () => {
    const r = await callRoutedLLM('hi', '', 'sys', { agentId: 'a5' }, { simpleModel: 'custom-simple' });
    expect(r.model).toBe('custom-simple');
    expect(mockCall.mock.calls[0][0].model).toBe('custom-simple');
  });

  it('honours a provided RouterConfig (complexMaxTokens)', async () => {
    const _r = await callRoutedLLM('x'.repeat(2500), '', 'sys', { agentId: 'a6' }, { complexMaxTokens: 9999 });
    expect(mockCall.mock.calls[0][0].maxTokens).toBe(9999);
  });
});

describe('callRoutedLLM — env overrides', () => {
  it('uses NEXUS_LLM_SIMPLE_MODEL from env when no config provided', async () => {
    mockGetEnv.mockReturnValue({ NEXUS_LLM_SIMPLE_MODEL: 'env-simple' });
    const r = await callRoutedLLM('hi', '', 'sys', { agentId: 'a7' });
    expect(r.model).toBe('env-simple');
  });

  it('uses generic NEXUS_LLM_MODEL for all tiers when no tier-specific env set', async () => {
    mockGetEnv.mockReturnValue({ NEXUS_LLM_MODEL: 'generic-model' });
    const r = await callRoutedLLM('hi', '', 'sys', { agentId: 'a8' });
    expect(r.model).toBe('generic-model');
  });

  it('env override wins even when a config is provided (source spreads env last)', async () => {
    mockGetEnv.mockReturnValue({ NEXUS_LLM_SIMPLE_MODEL: 'env-simple' });
    const r = await callRoutedLLM('hi', '', 'sys', { agentId: 'a9' }, { simpleModel: 'cfg-wins' });
    expect(r.model).toBe('env-simple');
  });
});

describe('callRoutedLLM — prompt assembly', () => {
  it('appends relevant context when contextText is non-empty', async () => {
    await callRoutedLLM('question?', 'some facts', 'sys', { agentId: 'b1' });
    const userMsg = mockCall.mock.calls[0][0].messages[1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('question?\n\n---\nRelevant context:\nsome facts');
    const sysMsg = mockCall.mock.calls[0][0].messages[0];
    expect(sysMsg.role).toBe('system');
    expect(sysMsg.content).toBe('sys');
  });

  it('omits context block when contextText is blank', async () => {
    await callRoutedLLM('bare question', '   ', 'sys', { agentId: 'b2' });
    const userMsg = mockCall.mock.calls[0][0].messages[1];
    expect(userMsg.content).toBe('bare question');
  });
});

describe('callRoutedLLM — error propagation', () => {
  it('propagates failures from the underlying LLM client', async () => {
    mockCall.mockRejectedValueOnce(new Error('upstream boom'));
    await expect(callRoutedLLM('hi', '', 'sys', { agentId: 'c1' })).rejects.toThrow('upstream boom');
  });
});

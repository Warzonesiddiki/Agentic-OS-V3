/**
 * services/llm-scheduler.test.ts — Unit tests for the LLM resource scheduler.
 * Pure: mocks env, token estimator, audit, logging. No DB, no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/env.js', () => ({ getEnv: vi.fn(() => ({})) }));
vi.mock('../../src/lib/tokens.js', () => ({ estimateTokens: vi.fn((s: string) => Math.ceil((s?.length ?? 0) / 4)) }));
vi.mock('../../src/lib/audit.js', () => ({ appendAudit: vi.fn(async () => {}) }));
vi.mock('../../src/lib/logging.js', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));

import {
  schedule,
  cancel,
  complete,
  fail,
  getStatus,
  getMetrics,
  getUserStatus,
  resetScheduler,
  setRateLimit,
  setTokenBudget,
  setModelRoutes,
  registerRateLimitProfile,
  getCostLog,
  getUserCost,
  PRIORITY_ORDER,
} from '../../src/services/llm-scheduler.js';
import { getEnv } from '../../src/lib/env.js';
import { appendAudit } from '../../src/lib/audit.js';

const mockEnv = vi.mocked(getEnv);
const mockAudit = vi.mocked(appendAudit as any);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({});
  resetScheduler();
});

afterEach(() => {
  resetScheduler();
});

describe('PRIORITY_ORDER', () => {
  it('ranks interactive above background above maintenance', () => {
    expect(PRIORITY_ORDER.interactive).toBeGreaterThan(PRIORITY_ORDER.background);
    expect(PRIORITY_ORDER.background).toBeGreaterThan(PRIORITY_ORDER.maintenance);
  });
});

describe('schedule — rate-limit admission', () => {
  it('runs a request immediately when under limits (status running)', async () => {
    const r = await schedule({ userId: 'u1', agentId: 'a1', category: 'chat', prompt: 'hi' });
    expect(r.status).toBe('running');
    expect(r.model).toBe('gpt-4o-mini'); // default chat route
    const st = getStatus();
    expect(st.running).toBe(1);
  });

  it('queues a request when concurrency limit is exceeded', async () => {
    const cfg = { rpm: 100, tpm: 1_000_000, concurrency: 1, priority: 'background' as const };
    setRateLimit('u2', cfg);
    // First fills the single concurrency slot
    const first = await schedule({ userId: 'u2', agentId: 'a1', category: 'chat', prompt: 'one' });
    expect(first.status).toBe('running');
    // Second must queue
    const second = await schedule({ userId: 'u2', agentId: 'a2', category: 'chat', prompt: 'two' });
    expect(second.status).toBe('queued');
    expect(getStatus().queueDepth).toBe(1);
    expect(mockAudit).toHaveBeenCalledWith('llm_scheduler.queued', expect.any(Object), 'llm-scheduler');
  });

  it('queues when token budget is exhausted', async () => {
    setTokenBudget('u3', 5); // tiny budget
    const r = await schedule({ userId: 'u3', agentId: 'a1', category: 'chat', prompt: 'x'.repeat(40) });
    expect(r.status).toBe('queued');
  });
});

describe('schedule — model route selection', () => {
  it('picks the reasoning route model', async () => {
    const r = await schedule({ userId: 'u4', agentId: 'a1', category: 'reasoning', prompt: 'think' });
    expect(r.model).toBe('gpt-4o');
    expect(r.maxTokens).toBe(4096);
    expect(r.temperature).toBe(0.3);
  });

  it('honors NEXUS_LLM_SIMPLE_MODEL env override for chat', async () => {
    mockEnv.mockReturnValue({ NEXUS_LLM_SIMPLE_MODEL: 'env-mini' });
    const r = await schedule({ userId: 'u5', agentId: 'a1', category: 'chat', prompt: 'hi' });
    expect(r.model).toBe('env-mini');
  });

  it('honors NEXUS_LLM_MEDIUM_MODEL env override for reasoning', async () => {
    mockEnv.mockReturnValue({ NEXUS_LLM_MEDIUM_MODEL: 'env-med' });
    const r = await schedule({ userId: 'u6', agentId: 'a1', category: 'reasoning', prompt: 'hi' });
    expect(r.model).toBe('env-med');
  });

  it('honors NEXUS_LLM_COMPLEX_MODEL env override for vision', async () => {
    mockEnv.mockReturnValue({ NEXUS_LLM_COMPLEX_MODEL: 'env-cplx' });
    const r = await schedule({ userId: 'u7', agentId: 'a1', category: 'vision', prompt: 'see' });
    expect(r.model).toBe('env-cplx');
  });

  it('honors an explicit model route override via setModelRoutes', async () => {
    setModelRoutes([{ category: 'chat', model: 'custom-chat', maxTokens: 777, temperature: 0.9, costPer1kPrompt: 1, costPer1kCompletion: 1 }]);
    const r = await schedule({ userId: 'u8', agentId: 'a1', category: 'chat', prompt: 'hi' });
    expect(r.model).toBe('custom-chat');
    expect(r.maxTokens).toBe(777);
    expect(r.temperature).toBe(0.9);
  });
});

describe('complete / fail / metrics', () => {
  it('records completion metrics and cost', async () => {
    const r = await schedule({ userId: 'u9', agentId: 'a1', category: 'chat', prompt: 'hi' });
    complete(r.id, { ok: true }, { promptTokens: 100, completionTokens: 200 });
    const m = getMetrics();
    expect(m.processed).toBe(1);
    expect(m.tokensProcessed).toBe(300);
    expect(m.totalCost).toBeGreaterThan(0);
    expect(m.avgLatencyMs).toBeGreaterThanOrEqual(0);
    const us = getUserStatus('u9')!;
    expect(us.running).toBe(0);
  });

  it('records failure metrics', async () => {
    const r = await schedule({ userId: 'u10', agentId: 'a1', category: 'chat', prompt: 'hi' });
    fail(r.id, 'boom');
    const m = getMetrics();
    expect(m.failed).toBe(1);
  });

  it('supports cost query filters', async () => {
    const r = await schedule({ userId: 'u11', agentId: 'a1', category: 'chat', prompt: 'hi' });
    complete(r.id, {}, { promptTokens: 50, completionTokens: 50 });
    expect(getCostLog({ userId: 'u11' })).toHaveLength(1);
    const uc = getUserCost('u11');
    expect(uc.requestCount).toBe(1);
    expect(uc.totalTokens).toBe(100);
  });
});

describe('cancel', () => {
  it('removes a queued request and frees the running slot', async () => {
    setRateLimit('u12', { rpm: 100, tpm: 1_000_000, concurrency: 1, priority: 'background' as const });
    const first = await schedule({ userId: 'u12', agentId: 'a1', category: 'chat', prompt: 'one' });
    const second = await schedule({ userId: 'u12', agentId: 'a2', category: 'chat', prompt: 'two' });
    expect(second.status).toBe('queued');
    const cancelled = cancel('u12', second.id);
    expect(cancelled).toBe(true);
    expect(getStatus().queueDepth).toBe(0);
    // first still running
    expect(getUserStatus('u12')!.running).toBe(1);
    expect(first.status).toBe('running');
  });
});

describe('getUserStatus', () => {
  it('returns null for unknown user and populated state for known', async () => {
    expect(getUserStatus('ghost')).toBeNull();
    await schedule({ userId: 'u13', agentId: 'a1', category: 'chat', prompt: 'hi' });
    const s = getUserStatus('u13')!;
    expect(s.running).toBe(1);
    expect(s.budget.budget).toBeGreaterThan(0);
  });
});

describe('registerRateLimitProfile', () => {
  it('creates a new default profile usable by priority', async () => {
    registerRateLimitProfile('burst', { rpm: 500, tpm: 2_000_000, concurrency: 20, priority: 'background' as const });
    const r = await schedule({ userId: 'u14', agentId: 'a1', category: 'chat', prompt: 'hi', priority: 'background' });
    expect(r.status).toBe('running');
  });
});

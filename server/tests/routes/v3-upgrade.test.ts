/**
 * routes/v3-upgrade.test.ts — Unit tests for the v3-upgrade routes (5 Pillars).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  db: { query: { apiKeys: { findMany: vi.fn().mockResolvedValue([]) } } },
  isSqlite: true,
}));

vi.mock('../../src/lib/security.js', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../../src/services/llm-gateway-v2.js', () => ({
  listProviders: vi.fn(),
  callLLMGateway: vi.fn(),
  getBreakerSnapshot: vi.fn(),
  setBudget: vi.fn(),
  getBudget: vi.fn(),
  killSession: vi.fn(),
}));

vi.mock('../../src/services/self-improvement-harness.js', () => ({
  proposeImprovement: vi.fn(),
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  approveProposal: vi.fn(),
  rejectProposal: vi.fn(),
  applyPatch: vi.fn(),
  measureAndFinalize: vi.fn(),
  recordMetric: vi.fn(),
  collectRecentMetrics: vi.fn(),
  harnessTick: vi.fn(),
}));

vi.mock('../../src/services/wasm-plugin-runtime.js', () => ({
  registerPlugin: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
  loadPlugin: vi.fn(),
  listInstalledPlugins: vi.fn(),
  invokePlugin: vi.fn(),
  listReceipts: vi.fn(),
  revokePlugin: vi.fn(),
}));

vi.mock('../../src/services/plugin-manifest.js', () => ({
  validateManifest: vi.fn(),
  safeValidateManifest: vi.fn(),
}));

vi.mock('../../src/services/federated-recall.js', () => ({
  publishMemoryProof: vi.fn(),
  ingestMemoryProof: vi.fn(),
  listRecentProofs: vi.fn(),
  federatedStats: vi.fn(),
}));

vi.mock('../../src/services/pipeline-executor.js', () => ({
  savePipeline: vi.fn(),
  runPipeline: vi.fn(),
  validateDAG: vi.fn(),
  listPipelines: vi.fn(),
  listPipelineRuns: vi.fn(),
}));

vi.mock('../../src/lib/auth-context.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/auth-context.js')>();
  return {
    ...orig,
    requireScope: vi
      .fn()
      .mockResolvedValue({ id: 'p1', name: 'admin', scopes: ['llm:chat', 'brain:admin'] }),
    safeJson: vi.fn(),
    parse: vi.fn(),
  };
});

import { v3upgrade } from '../../src/routes/v3-upgrade.js';
import * as llm from '../../src/services/llm-gateway-v2.js';

describe('v3-upgrade routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/lib/auth-context.js');
    const _safeJson = vi.mocked(mod.safeJson);
    const _parse = vi.mocked(mod.parse);
    _safeJson.mockResolvedValue({
      sessionId: 's1',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello' }],
    });
    _parse.mockImplementation((_schema: any, data: any) => data);
  });

  it('GET /api/v1/llm/providers should list providers', async () => {
    vi.mocked(llm.listProviders).mockReturnValue([
      { name: 'openai', models: ['gpt-4'], capabilities: ['chat'] },
    ] as any);

    const res = await v3upgrade.request('/api/v1/llm/providers', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.providers).toHaveLength(1);
    expect(json.data.providers[0].name).toBe('openai');
  });

  it('POST /api/v1/llm/chat should call LLM gateway and return result', async () => {
    vi.mocked(llm.callLLMGateway).mockResolvedValue({
      content: 'Hello!',
      model: 'gpt-4',
      tokens: 10,
    } as any);

    const res = await v3upgrade.request('/api/v1/llm/chat', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.content).toBe('Hello!');
  });

  it('GET /api/v1/improvement/proposals should list proposals', async () => {
    const { listProposals } = await import('../../src/services/self-improvement-harness.js');
    vi.mocked(listProposals as any).mockResolvedValue([{ id: 'prop-1', title: 'Test' }]);

    const res = await v3upgrade.request('/api/v1/improvement/proposals', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.items).toHaveLength(1);
  });

  it('GET /api/v1/plugins should list plugins', async () => {
    const { listInstalledPlugins } = await import('../../src/services/wasm-plugin-runtime.js');
    vi.mocked(listInstalledPlugins as any).mockResolvedValue([
      { id: 'plug-1', name: 'test-plugin' },
    ]);

    const res = await v3upgrade.request('/api/v1/plugins', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.items).toHaveLength(1);
  });

  it('GET /api/v1/federated/stats should return federated stats', async () => {
    const { federatedStats } = await import('../../src/services/federated-recall.js');
    vi.mocked(federatedStats as any).mockResolvedValue({ totalProofs: 42, activePeers: 3 });

    const res = await v3upgrade.request('/api/v1/federated/stats', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.totalProofs).toBe(42);
  });

  it('GET /api/v1/pipelines should list pipelines', async () => {
    const { listPipelines } = await import('../../src/services/pipeline-executor.js');
    vi.mocked(listPipelines as any).mockResolvedValue([{ id: 'pipe-1', name: 'test-pipeline' }]);

    const res = await v3upgrade.request('/api/v1/pipelines', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.items).toHaveLength(1);
  });

  it('GET /api/v1/llm/breakers should return circuit breaker snapshot', async () => {
    vi.mocked(llm.getBreakerSnapshot).mockResolvedValue({
      openai: 'closed',
      anthropic: 'closed',
    } as any);

    const res = await v3upgrade.request('/api/v1/llm/breakers', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.openai).toBe('closed');
  });

  it('POST /api/v1/llm/budget/:sessionId/kill should kill a session', async () => {
    vi.mocked(llm.killSession).mockResolvedValue();
    const mod = await import('../../src/lib/auth-context.js');
    vi.mocked(mod.safeJson).mockResolvedValue({ reason: 'Budget exceeded' });
    vi.mocked(mod.parse).mockImplementation((_schema: any, data: any) => data);

    const res = await v3upgrade.request('/api/v1/llm/budget/s1/kill', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.killed).toBe(true);
  });
});

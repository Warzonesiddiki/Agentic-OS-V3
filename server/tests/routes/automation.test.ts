/**
 * routes/automation.test.ts — Unit tests for automation routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  db: { query: { apiKeys: { findMany: vi.fn().mockResolvedValue([]) } } },
  isSqlite: true,
}));

vi.mock('../../src/lib/security.js', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../../src/services/operations-ext.js', () => ({
  requestApproval: vi.fn(),
  resolveApproval: vi.fn(),
}));

vi.mock('../../src/services/file-watcher.js', () => ({
  syncWorkspace: vi.fn(),
}));

vi.mock('../../src/lib/guards.js', () => ({
  safeVaultPath: vi.fn(),
}));

vi.mock('../../src/services/sse-bus.js', () => ({
  broadcastSSE: vi.fn(),
}));

vi.mock('../../src/lib/auth-context.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/auth-context.js')>();
  return {
    ...orig,
    requireScope: vi.fn().mockResolvedValue({ id: 'p1', name: 'tester', scopes: ['blog'] }),
    safeJson: vi.fn(),
    parse: vi.fn(),
  };
});

import { automation } from '../../src/routes/automation.js';
import * as opsExt from '../../src/services/operations-ext.js';
import * as fileWatcher from '../../src/services/file-watcher.js';
import * as guards from '../../src/lib/guards.js';

describe('automation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/v1/approvals/request should request approval and return 201', async () => {
    vi.mocked(opsExt.requestApproval).mockResolvedValue({ id: 'apr-1', status: 'pending' } as any);

    const body = {
      agentId: 'a1',
      taskId: 't1',
      tool: 'write',
      riskLevel: 'high',
      payload: { file: 'x.txt' },
      reasoning: 'needs review',
    };
    const { safeJson, parse } = await import('../../src/lib/auth-context.js');
    vi.mocked(safeJson as any).mockResolvedValue(body);
    vi.mocked(parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await automation.request('/api/v1/approvals/request', { method: 'POST' });
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.id).toBe('apr-1');
  });

  it('POST /api/v1/approvals/resolve should resolve an approval', async () => {
    vi.mocked(opsExt.resolveApproval).mockResolvedValue(undefined);

    const { safeJson, parse } = await import('../../src/lib/auth-context.js');
    vi.mocked(safeJson as any).mockResolvedValue({ taskId: 't1', approved: true });
    vi.mocked(parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await automation.request('/api/v1/approvals/resolve', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.resolved).toBe(true);
    expect(json.data.approved).toBe(true);
  });

  it('POST /api/v1/workspace/sync should sync workspace directory', async () => {
    vi.mocked(guards.safeVaultPath).mockReturnValue({
      ok: true,
      resolved: '/safe/workspace',
    } as any);
    vi.mocked(fileWatcher.syncWorkspace).mockResolvedValue({ files: 5, skipped: 0 } as any);

    const { safeJson, parse } = await import('../../src/lib/auth-context.js');
    vi.mocked(safeJson as any).mockResolvedValue({ dir: './my-workspace' });
    vi.mocked(parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await automation.request('/api/v1/workspace/sync', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.files).toBe(5);
  });

  it('POST /api/v1/workspace/sync should reject unsafe directory paths', async () => {
    vi.mocked(guards.safeVaultPath).mockReturnValue({ ok: false, reason: 'path traversal' } as any);

    const { safeJson, parse } = await import('../../src/lib/auth-context.js');
    vi.mocked(safeJson as any).mockResolvedValue({ dir: '../../etc/passwd' });
    vi.mocked(parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await automation.request('/api/v1/workspace/sync', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, any>;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/approvals/resolve should handle rejection', async () => {
    vi.mocked(opsExt.resolveApproval).mockResolvedValue(undefined);

    const { safeJson, parse } = await import('../../src/lib/auth-context.js');
    vi.mocked(safeJson as any).mockResolvedValue({ taskId: 't1', approved: false });
    vi.mocked(parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await automation.request('/api/v1/approvals/resolve', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json.data.approved).toBe(false);
  });
});

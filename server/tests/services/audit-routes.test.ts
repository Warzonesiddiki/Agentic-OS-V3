/**
 * audit-routes.test.ts — HTTP route handlers for the audit surface (Aegis).
 *
 * Exercises the Hono `auditRouter` end-to-end (request -> handler -> envelope)
 * with all DB / external integrations mocked so the test stays hermetic and
 * avoids the native better-sqlite3 binding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireScope = vi.fn(async () => ({ id: 'user-1' }));
const mockParse = vi.fn((_schema: unknown, value: unknown) => value);
const mockSafeJson = vi.fn(async (c: { req: { json: () => Promise<unknown> } }) => c.req.json());
const mockOk = vi.fn((data: unknown, _reqId: string) => ({ ok: true, data }));
const mockErr = vi.fn((code: string, msg: string, _reqId: string) => ({ ok: false, error: { code, msg } }));

vi.mock('../../src/lib/auth-context.js', () => ({
  requireScope: (c: unknown, _s: string) => mockRequireScope(c),
  parse: (_s: unknown, v: unknown) => mockParse(_s, v),
  safeJson: (c: unknown) => mockSafeJson(c as never),
}));
vi.mock('../../src/lib/envelope.js', () => ({
  ok: (d: unknown, r: string) => mockOk(d, r),
  err: (code: string, msg: string, r: string) => mockErr(code, msg, r),
}));
vi.mock('../../src/lib/audit.js', () => ({
  verifyAuditChain: vi.fn(async () => ({ valid: true, checked: 10 })),
}));
vi.mock('../../src/services/audit-engine.js', () => ({
  verifyAndAutoKill: vi.fn(async () => ({ healthy: true, reason: 'ok' })),
  logTrajectory: vi.fn(async (b: unknown) => ({ auditSequence: 1, trajectoryId: 'trj_x', ...(b as object) })),
  logToolReceipt: vi.fn(async (b: unknown) => ({ receiptId: 'rcp_x', ...(b as object) })),
}));
vi.mock('../../src/services/blockchain.js', () => ({
  verifyAnchor: vi.fn(async (id: string) => ({ found: true, anchorId: id, valid: true })),
  anchorAuditLogsBatch: vi.fn(async () => ({ txHash: '0xabc', anchored: 3 })),
}));
vi.mock('../../src/db/client.js', () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(async () => [{ sequence: 1 }]) })) })) })) },
  auditLog: {},
}));
vi.mock('../../src/lib/logging.js', () => ({ log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { auditRouter } from '../../src/routes/audit-routes.js';

const okBody = (res: Response) => res.json() as Promise<{ ok: boolean; data?: unknown; error?: unknown }>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireScope.mockResolvedValue({ id: 'user-1' });
  mockParse.mockImplementation((_s: unknown, v: unknown) => v);
  mockSafeJson.mockImplementation(async (c: { req: { json: () => Promise<unknown> } }) => c.req.json());
});

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  };
  return auditRouter.request(path, init);
}

describe('GET /api/v1/audit', () => {
  it('requires audit:read scope and returns chain validity', async () => {
    const res = await call('GET', '/api/v1/audit');
    expect(mockRequireScope).toHaveBeenCalledWith(expect.anything(), 'audit:read');
    const json = await okBody(res);
    expect(json.ok).toBe(true);
    expect((json.data as { valid: boolean }).valid).toBe(true);
  });
});

describe('GET /api/v1/audit/verify', () => {
  it('runs verifyAndAutoKill and returns health', async () => {
    const res = await call('GET', '/api/v1/audit/verify');
    const json = await okBody(res);
    expect(json.ok).toBe(true);
    expect((json.data as { healthy: boolean }).healthy).toBe(true);
  });
});

describe('GET /api/v1/audit/logs', () => {
  it('returns recent audit log rows', async () => {
    const res = await call('GET', '/api/v1/audit/logs');
    const json = await okBody(res);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe('GET /api/v1/audit/verify/:anchorId', () => {
  it('returns NOT_FOUND envelope when anchor missing', async () => {
    const { verifyAnchor } = await import('../../src/services/blockchain.js');
    vi.mocked(verifyAnchor).mockResolvedValueOnce({ found: false, anchorId: 'a1' });
    const res = await call('GET', '/api/v1/audit/verify/a1');
    const json = await okBody(res);
    expect(json.ok).toBe(false);
    expect((json.error as { code: string }).code).toBe('NOT_FOUND');
  });

  it('returns the anchor when found', async () => {
    const res = await call('GET', '/api/v1/audit/verify/a2');
    const json = await okBody(res);
    expect(json.ok).toBe(true);
  });
});

describe('POST /api/v1/audit/anchor', () => {
  it('anchors pending logs', async () => {
    const res = await call('POST', '/api/v1/audit/anchor');
    const json = await okBody(res);
    expect(json.ok).toBe(true);
  });
});

describe('POST /api/v1/audit/trajectory', () => {
  it('logs a trajectory and returns 201', async () => {
    const res = await call('POST', '/api/v1/audit/trajectory', {
      agentId: 'a1',
      model: 'm1',
      promptSent: 'hi',
    });
    expect(res.status).toBe(201);
    const json = await okBody(res);
    expect(json.ok).toBe(true);
    expect((json.data as { trajectoryId: string }).trajectoryId).toBe('trj_x');
  });
});

describe('POST /api/v1/audit/receipt', () => {
  it('logs a tool receipt and returns 201', async () => {
    const res = await call('POST', '/api/v1/audit/receipt', {
      agentId: 'a1',
      tool: 'vfs.write',
      authorized: true,
    });
    expect(res.status).toBe(201);
    const json = await okBody(res);
    expect(json.ok).toBe(true);
    expect((json.data as { receiptId: string }).receiptId).toBe('rcp_x');
  });
});

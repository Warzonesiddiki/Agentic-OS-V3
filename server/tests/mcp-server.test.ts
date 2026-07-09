/**
 * Aeon2 — MCP server coverage (server/src/mcp.ts).
 *
 * Drives the real Nexus MCP server over an in-memory MCP transport using the
 * official SDK Client, with every DB-backed service module mocked out.
 * Proves that every registered tool executes end-to-end against a mock context,
 * every resource URI resolves, and every prompt renders. No FROZEN files are
 * touched — mcp.ts is within Aeon's namespace.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { randomUUID } from 'node:crypto';

const mem = (over: Record<string, unknown> = {}) => ({
  id: `mem_${randomUUID()}`,
  kind: 'semantic',
  title: 'mock title',
  content: 'mock content',
  tags: ['mock'],
  importance: 0.5,
  ...over,
});

// ---- Mock DB / service boundaries (specifiers match mcp.ts imports) --------
vi.mock('../src/db/client.js', () => {
  const fakeRow = { n: 3, total: 10 };
  const selChain = {
    from: () => selChain,
    where: () => selChain,
    limit: () => selChain,
    orderBy: () => selChain,
    then: (res: (v: unknown) => void) => res([fakeRow]),
  };
  const txChain = {
    insert: () => txChain,
    update: () => txChain,
    delete: () => txChain,
    values: () => txChain,
    set: () => txChain,
    where: () => txChain,
    returning: () => txChain,
    then: (res: (v: unknown) => void) => res([mem()]),
  };
  const queryMemories = { findMany: async () => [mem(), mem()] };
  const dbObj: Record<string, unknown> = {
    select: () => selChain,
    insert: () => txChain,
    update: () => txChain,
    delete: () => txChain,
    transaction: async (fn: (tx: unknown) => unknown) => fn(txChain),
    query: { memories: queryMemories },
  };
  return {
    db: dbObj,
    isPostgres: false,
    isSqlite: true,
    memories: {},
    skills: {},
    tokenLedger: {},
    auditLog: {},
    notes: {},
    __fakeRow: fakeRow,
  };
});

vi.mock('../src/setup.js', () => ({ dbReachable: vi.fn().mockResolvedValue(true) }));

vi.mock('../src/lib/lru-cache.js', () => ({
  statsCache: { get: vi.fn().mockReturnValue(undefined), set: vi.fn() },
}));

vi.mock('../src/lib/security.js', () => ({ enforceScope: vi.fn(() => true) }));

vi.mock('../src/lib/audit.js', () => ({
  verifyAuditChain: vi.fn().mockResolvedValue({ valid: true, total: 7 }),
  appendAudit: vi.fn(),
}));

vi.mock('../src/services/recall.js', () => ({
  recall: vi.fn().mockResolvedValue([{ id: 'mem_x', content: 'recalled', score: 0.9 }]),
}));

vi.mock('../src/services/kernel.js', () => ({
  spawnAgent: vi.fn(async () => ({ id: 'agent_1', name: 'forge' })),
  listAgents: vi.fn(async () => [{ id: 'agent_1', name: 'forge', status: 'idle' }]),
  enqueueTask: vi.fn(async () => ({ id: 'task_1', label: 'do', kind: 'interactive' })),
  schedulerStatus: vi.fn(async () => ({ policy: 'mlfq', queueDepth: 0 })),
  checkACL: vi.fn((_ring: number, _tool: string) => true),
}));

vi.mock('../src/services/operations-ext.js', () => ({
  createCronJob: vi.fn(async () => ({ id: 'cron_1', name: 'nightly' })),
  listCronJobs: vi.fn(async () => [{ id: 'cron_1', name: 'nightly', cron: '0 0 * * *' }]),
  ingestAmbientTranscript: vi.fn(async () => ({ ingested: true, chunks: 2 })),
}));

vi.mock('../src/services.js', () => ({
  createMemory: vi.fn(async (input: Record<string, unknown>) => mem({ title: input.title, content: input.content })),
  captureSession: vi.fn(async () => ({ captured: true, skills: 1, memories: 2 })),
  recordFeedback: vi.fn(async () => ({ recorded: true })),
  isKillSwitchOn: vi.fn(async () => false),
}));

const { createNexusMcpServer } = await import('../src/mcp.js');

let client: Client;
let server: ReturnType<typeof createNexusMcpServer>;

async function boot() {
  // Broad scope set so every gated tool is permitted in this harness.
  server = createNexusMcpServer('aeon-test', [
    'memory:read',
    'memory:write',
    'audit:read',
    'brain:admin',
  ]);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'aeon-test-client', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  // High-level McpServer registers tools/prompts/resources asynchronously.
  await new Promise((r) => setTimeout(r, 300));
}

beforeAll(async () => {
  await boot();
});

afterAll(async () => {
  await client?.close();
  await server?.close();
});

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
describe('Nexus MCP server — tools', () => {
  it('lists all registered tools (≥14)', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names.length).toBeGreaterThanOrEqual(14);
    for (const expected of [
      'nexus_recall',
      'nexus_remember',
      'nexus_capture',
      'nexus_feedback',
      'nexus_audit_verify',
      'nexus_stats',
      'nexus_delegate',
      'nexus_agents',
      'nexus_scheduler',
      'nexus_cron_create',
      'nexus_cron_list',
      'nexus_browser_navigate',
      'nexus_browser_extract',
      'nexus_browser_screenshot',
      'nexus_ambient_ingest',
      'nexus_acl_check',
    ]) {
      expect(names, `missing ${expected}`).toContain(expected);
    }
  });

  it('nexus_recall executes', async () => {
    const r = await client.callTool({ name: 'nexus_recall', arguments: { query: 'x' } });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data[0].content).toBe('recalled');
  });

  it('nexus_remember executes', async () => {
    const r = await client.callTool({
      name: 'nexus_remember',
      arguments: { kind: 'fact', title: 'T', content: 'C', tags: ['t'], importance: 0.9 },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.stored).toBe(true);
    expect(data.memory.title).toBe('T');
  });

  it('nexus_capture executes', async () => {
    const r = await client.callTool({
      name: 'nexus_capture',
      arguments: { transcript: 'hello world' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.captured).toBe(true);
  });

  it('nexus_feedback executes', async () => {
    const r = await client.callTool({
      name: 'nexus_feedback',
      arguments: { query: 'q', itemId: 'i1', itemType: 'memory', helpful: true },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.recorded).toBe(true);
  });

  it('nexus_audit_verify executes', async () => {
    const r = await client.callTool({ name: 'nexus_audit_verify', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.valid).toBe(true);
  });

  it('nexus_stats executes', async () => {
    const r = await client.callTool({ name: 'nexus_stats', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data).toHaveProperty('memories');
    expect(data.dbReachable).toBe(true);
  });

  it('nexus_delegate executes', async () => {
    const r = await client.callTool({
      name: 'nexus_delegate',
      arguments: { name: 'forge', taskLabel: 'build', kind: 'sub-agent' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.agentId).toBeDefined();
    expect(data.taskId).toBeDefined();
  });

  it('nexus_agents executes', async () => {
    const r = await client.callTool({ name: 'nexus_agents', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  it('nexus_scheduler executes', async () => {
    const r = await client.callTool({ name: 'nexus_scheduler', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data).toHaveProperty('policy');
  });

  it('nexus_cron_create executes', async () => {
    const r = await client.callTool({
      name: 'nexus_cron_create',
      arguments: { name: 'nightly', cron: '0 0 * * *', taskLabel: 'backup' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.jobId).toBeDefined();
  });

  it('nexus_cron_list executes', async () => {
    const r = await client.callTool({ name: 'nexus_cron_list', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(Array.isArray(data.jobs)).toBe(true);
  });

  it('nexus_browser_navigate returns stubbed payload', async () => {
    const r = await client.callTool({
      name: 'nexus_browser_navigate',
      arguments: { url: 'https://example.com', agentId: 'a1' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.error).toContain('not available');
  });

  it('nexus_browser_extract returns stubbed payload', async () => {
    const r = await client.callTool({
      name: 'nexus_browser_extract',
      arguments: { url: 'https://example.com', agentId: 'a1' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.error).toContain('not available');
  });

  it('nexus_browser_screenshot returns stubbed payload', async () => {
    const r = await client.callTool({
      name: 'nexus_browser_screenshot',
      arguments: { url: 'https://example.com', agentId: 'a1' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.error).toContain('not available');
  });

  it('nexus_ambient_ingest executes', async () => {
    const r = await client.callTool({
      name: 'nexus_ambient_ingest',
      arguments: { transcript: 'voice note', source: 'ambient' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.ingested).toBe(true);
  });

  it('nexus_acl_check executes', async () => {
    const r = await client.callTool({
      name: 'nexus_acl_check',
      arguments: { ring: 2, tool: 'nexus_recall' },
    });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as { text: string }[])[0].text);
    expect(data.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
describe('Nexus MCP server — resources', () => {
  it('lists resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('nexus://brain/stats');
    expect(uris).toContain('nexus://brain/health');
    expect(uris).toContain('nexus://brain/ambient');
  });

  it('resolves nexus://brain/stats', async () => {
    const r = await client.readResource({ uri: 'nexus://brain/stats' });
    const text = (r.contents[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('memories');
  });

  it('resolves nexus://brain/health', async () => {
    const r = await client.readResource({ uri: 'nexus://brain/health' });
    const text = (r.contents[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.db).toBe('ok');
  });

  it('resolves nexus://brain/ambient', async () => {
    const r = await client.readResource({ uri: 'nexus://brain/ambient' });
    const text = (r.contents[0] as { text: string }).text;
    expect(text).toContain('NEXUS ambient context');
  });
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
describe('Nexus MCP server — prompts', () => {
  it('lists prompts', async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain('recall-and-execute');
    expect(names).toContain('resume-work');
    expect(names).toContain('capture-session');
  });

  it('gets recall-and-execute prompt', async () => {
    const r = await client.getPrompt({ name: 'recall-and-execute', arguments: { query: 'ship' } });
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it('gets resume-work prompt', async () => {
    const r = await client.getPrompt({ name: 'resume-work', arguments: {} });
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it('gets capture-session prompt', async () => {
    const r = await client.getPrompt({
      name: 'capture-session',
      arguments: { transcript: 'did a thing' },
    });
    expect(r.messages.length).toBeGreaterThan(0);
  });
});

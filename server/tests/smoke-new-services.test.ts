/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the audit module so guardrails tests don't need PostgreSQL
vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue({
    id: 'mock_audit',
    sequence: 0,
    actor: 'test',
    action: 'mock',
    payload: null,
    prevHash: '',
    entryHash: '',
    createdAt: new Date(),
  }),
}));

vi.mock('../src/services/audit-engine.js', () => ({
  logToolReceipt: vi.fn().mockResolvedValue({ id: 'mock_receipt' }),
}));

vi.mock('../src/services/kernel.js', () => ({
  getAgent: vi.fn().mockResolvedValue(null),
  authorizeToolCall: vi
    .fn()
    .mockImplementation(async (agentId, ring, tool, target, actor, minRing) => {
      if (ring === 4) return false;
      if (minRing !== undefined && ring > minRing) return false;
      return true;
    }),
  incrementTokenUsage: vi.fn().mockResolvedValue(0),
  pauseAgent: vi.fn().mockResolvedValue(null),
  listAgents: vi.fn().mockResolvedValue([]),
}));

// ── Phase 3.2: Message Bus ──────────────────────────────────
import { getMessageBus, type BusMessage } from '../src/services/message-bus.js';

// ── Phase 2d: Signal Hooks ───────────────────────────────────
import {
  registerHook,
  emitSignal,
  clearAllHooks,
  listHooks,
  composeHooks,
} from '../src/services/signal-hooks.js';

// ── Phase 2b: Agent Runtime ──────────────────────────────────
import { ActionRegistry } from '../src/services/agent-runtime.js';
import { z } from 'zod';

// ── Phase 3.3: MCP Registry ──────────────────────────────────
import { mcpRegistry, JsonRpcMessageParser } from '../src/services/mcp-registry.js';

// ── Phase 4a: StateGraph ─────────────────────────────────────
import { StateGraph } from '../src/services/graph-engine.js';

// ── Phase 4d: Scheduler ──────────────────────────────────────
import { CronParser } from '../src/services/scheduler.js';

// ── Phase 5d: Pipeline I/O ───────────────────────────────────
import { PipelineIO } from '../src/services/pipeline-io.js';

// ── Phase 6b: Guardrails ─────────────────────────────────────
import {
  registerGuardrail,
  assertWithinGuardrail,
  setGuardrailThreshold,
  listGuardrails,
} from '../src/services/guardrails.js';

// ── Phase 5a: Tracing ────────────────────────────────────────
import { getTraceProvider } from '../src/services/tracing.js';

const SUB_ID = 'smoke-test';

describe('Phase 3.2 — Message Bus', () => {
  let bus: ReturnType<typeof getMessageBus>;
  let subs: string[];

  beforeEach(() => {
    bus = getMessageBus();
    subs = [];
  });

  afterEach(() => {
    for (const id of subs) bus.unsubscribe(id);
  });

  it('publishes and subscribes to topics', async () => {
    const received: BusMessage[] = [];
    const sub = bus.subscribe(SUB_ID, 'test/topic', (msg) => {
      received.push(msg);
    });
    subs.push(sub.id);
    await bus.publish('test.event', SUB_ID, undefined, { hello: 'world' }, 'event', 'test/topic');
    await new Promise((r) => setTimeout(r, 30));
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.payload).toEqual({ hello: 'world' });
  });

  it('supports wildcard subscriptions (*)', async () => {
    const received: BusMessage[] = [];
    const sub = bus.subscribe(SUB_ID, 'test/*', (msg) => {
      received.push(msg);
    });
    subs.push(sub.id);
    await bus.publish('test.event', SUB_ID, undefined, { n: 1 }, 'event', 'test/alpha');
    await bus.publish('test.event', SUB_ID, undefined, { n: 2 }, 'event', 'test/beta');
    await new Promise((r) => setTimeout(r, 30));
    expect(received.length).toBeGreaterThanOrEqual(2);
  });

  it('handles RPC request/response', async () => {
    const sub = bus.subscribe('rpc-handler', 'echo/*', async (msg) => {
      if (msg.kind === 'command' && msg.type === 'ping') {
        bus.respond(msg.correlationId!, 'rpc-handler', msg.from, {
          echoed: (msg.payload as { message: string }).message,
        });
      }
    });
    subs.push(sub.id);
    const result = await bus.request(
      'echo/test',
      SUB_ID,
      { method: 'ping', params: { message: 'hello' }, timeoutMs: 3000 },
      3000
    );
    expect(result.success).toBe(true);
  });
});

describe('Phase 2d — Signal Hooks', () => {
  beforeEach(() => clearAllHooks());
  afterEach(() => clearAllHooks());

  it('hooks fire when signal is emitted', async () => {
    const order: string[] = [];
    registerHook('on_agent_start', async () => {
      order.push('first');
    });
    registerHook('on_agent_start', async () => {
      order.push('second');
    });
    await emitSignal('on_agent_start', {
      agentId: 'a1',
      goal: 'test',
      actor: 'test',
      timestamp: Date.now(),
    });
    expect(order).toEqual(['first', 'second']);
  });

  it('lists registered hooks', async () => {
    registerHook('on_tool_start', async () => {});
    const hooks = listHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    expect(hooks.some((h) => h.event === 'on_tool_start')).toBe(true);
  });

  it('composeHooks exists', () => {
    expect(composeHooks).toBeInstanceOf(Function);
  });
});

describe('Phase 2b — Action Registry', () => {
  const actionCtx = { agentId: 'a1', actor: 'test' };

  it('registers and executes an action', async () => {
    const registry = new ActionRegistry();
    registry.register({
      name: 'test_action',
      description: 'A test action',
      similes: ['test', 'tst'],
      examples: [],
      metadata: { version: '1.0', category: 'general', timeoutMs: 5000 },
      schema: z.object({ x: z.string() }),
      handler: async (input) => `ok ${input.x}`,
    });
    const result = await registry.execute('test_action', { x: 'hello' }, actionCtx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('ok hello');
  });

  it('returns ok:false for unknown action', async () => {
    const registry = new ActionRegistry();
    const result = await registry.execute('not_found', {}, actionCtx);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('fuzzy find matches actions', () => {
    const registry = new ActionRegistry();
    registry.register({
      name: 'create_memory',
      description: 'Creates a memory',
      similes: ['remember', 'store'],
      examples: [],
      metadata: { version: '1.0', category: 'memory', timeoutMs: 5000 },
      schema: z.object({}),
      handler: async () => 'ok',
    });
    const found = registry.fuzzyFind('remember');
    expect(found).toBeDefined();
  });

  it('enforces strict validate -> authorize -> execute -> audit lifecycle', async () => {
    const registry = new ActionRegistry();
    let handlerCalled = false;

    registry.register({
      name: 'strict_action',
      description: 'A strict lifecycle test action',
      similes: [],
      examples: [],
      metadata: { version: '1.0', minRing: 1, timeoutMs: 5000 },
      schema: z.object({ count: z.number() }),
      handler: async (input) => {
        handlerCalled = true;
        return `count: ${input.count}`;
      },
    });

    // 1. Validation failure: input.count is a string instead of number
    const invalidRes = await registry.execute(
      'strict_action',
      { count: 'not_a_number' },
      { agentId: 'a1', actor: 'test', agentRing: 1 }
    );
    expect(invalidRes.ok).toBe(false);
    expect(invalidRes.error).toContain('Validation failed');
    expect(handlerCalled).toBe(false);

    // 2. Authorization failure: agentRing 4 (quarantined)
    const unauthorizedRes = await registry.execute(
      'strict_action',
      { count: 10 },
      { agentId: 'a1', actor: 'test', agentRing: 4 }
    );
    expect(unauthorizedRes.ok).toBe(false);
    expect(unauthorizedRes.error).toContain('Authorization failed');
    expect(handlerCalled).toBe(false);

    // 3. Successful execution with ring 1
    const successRes = await registry.execute(
      'strict_action',
      { count: 10 },
      { agentId: 'a1', actor: 'test', agentRing: 1 }
    );
    expect(successRes.ok).toBe(true);
    expect(successRes.data).toBe('count: 10');
    expect(handlerCalled).toBe(true);
  });
});

describe('Phase 3.3 & Phase 12 — MCP Registry', () => {
  it('returns singleton instance', () => {
    expect(mcpRegistry).toBeDefined();
  });

  it('starts with empty server list', () => {
    expect(mcpRegistry.listServers()).toEqual([]);
  });

  it('parses line-delimited JSON-RPC messages', () => {
    const parser = new JsonRpcMessageParser(1024);
    const msgs: any[] = [];
    parser.parseChunk('{"jsonrpc":"2.0","id":1,"method":"ping"}\n', (msg) => msgs.push(msg));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' });
  });

  it('parses Content-Length framed JSON-RPC messages', () => {
    const parser = new JsonRpcMessageParser(1024);
    const msgs: any[] = [];
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { status: 'ok' } });
    const headerStr = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
    parser.parseChunk(headerStr, (msg) => msgs.push(msg));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toEqual({ jsonrpc: '2.0', id: 2, result: { status: 'ok' } });
  });

  it('skips non-JSON stdout log lines safely', () => {
    const parser = new JsonRpcMessageParser(1024);
    const msgs: any[] = [];
    parser.parseChunk(
      'INFO: process starting up...\n{"jsonrpc":"2.0","id":3,"method":"initialized"}\n',
      (msg) => msgs.push(msg)
    );
    expect(msgs.length).toBe(1);
    expect(msgs[0].id).toBe(3);
  });

  it('triggers error callback on buffer limit overflow', () => {
    const parser = new JsonRpcMessageParser(50);
    let errorCaught: Error | null = null;
    parser.parseChunk(
      'A'.repeat(100),
      () => {},
      (err: any) => {
        errorCaught = err as Error;
      }
    );
    expect(errorCaught).not.toBeNull();
    expect((errorCaught as Error | null)?.message).toContain('buffer limit exceeded');
  });

  it('maps discovered tools into ActionRegistry', async () => {
    const registry = new ActionRegistry();
    mcpRegistry.setActionRegistry(registry);

    const server = mcpRegistry.register('test-server', 'stdio', { command: 'node', args: ['-v'] });
    server.tools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ];

    mcpRegistry.syncToolsToActionRegistry(server.id);

    const action = registry.get('test_tool');
    expect(action).toBeDefined();
    expect(action?.description).toContain('A test tool');

    mcpRegistry.unregister(server.id);
    expect(registry.get('test_tool')).toBeUndefined();
  });
});

describe('Phase 4a — StateGraph', () => {
  it('executes a simple linear graph', async () => {
    const graph = new StateGraph<{ value: number }>()
      .addNode('double', async (s) => ({ value: s.value * 2 }))
      .addNode('addOne', async (s) => ({ value: s.value + 1 }))
      .addEdge('double', 'addOne')
      .compile();

    const result = await graph.invoke({ value: 5 });
    expect(result.state.value).toBe(11);
  });

  it('executes single-node graph', async () => {
    const graph = new StateGraph<{ counter: number }>()
      .addNode('inc', async (s) => ({ counter: s.counter + 1 }))
      .compile();

    const result = await graph.invoke({ counter: 0 });
    expect(result.state.counter).toBe(1);
  });
});

describe('Phase 4d — Scheduler (CronParser)', () => {
  it('parses a cron expression and gets next run', () => {
    const parser = new CronParser('*/5 * * * *');
    const next = parser.getNextRun();
    expect(next).toBeInstanceOf(Date);
  });

  it('validates correct expressions', () => {
    expect(CronParser.validate('0 9 * * 1-5')).toBe(true);
    expect(CronParser.validate('invalid')).toBe(false);
  });

  it('serializes back to original expression', () => {
    const parser = new CronParser('0 0 * * *');
    expect(parser.serialize()).toBe('0 0 * * *');
  });
});

describe('Phase 5d — Pipeline I/O', () => {
  it('exports and re-imports YAML', () => {
    const yaml = PipelineIO.exportToYaml(
      {
        nodes: [{ id: 'n1', type: 'agent.run' as const, config: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
      { name: 'test-pipeline' }
    );
    expect(yaml).toContain('test-pipeline');

    const result = PipelineIO.importFromYaml(yaml);
    expect(result.pipeline).toBeDefined();
    expect(result.dag).toBeDefined();
  });

  it('throws on invalid YAML', () => {
    expect(() => PipelineIO.importFromYaml('not: valid: yaml: [[[')).toThrow();
  });

  it('provides templates', () => {
    const templates = PipelineIO.getTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });
});

describe('Phase 6b — Guardrails', () => {
  it('blocks a value above a registered max', () => {
    registerGuardrail({
      id: 'smoke.tokens.per_run',
      metric: 'tokens',
      max: 100,
      warnAt: 80,
      enabled: true,
    });
    const check = assertWithinGuardrail('smoke.tokens.per_run', 150);
    expect(check.allowed).toBe(false);
    expect(check.level).toBe('block');
  });

  it('warns when value is within the warn band', () => {
    registerGuardrail({
      id: 'smoke.tool_calls.per_run',
      metric: 'tool_calls',
      max: 200,
      warnAt: 160,
      enabled: true,
    });
    const check = assertWithinGuardrail('smoke.tool_calls.per_run', 180);
    expect(check.allowed).toBe(true);
    expect(check.level).toBe('warn');
  });

  it('allows a value under the max', () => {
    registerGuardrail({
      id: 'smoke.cost.per_run',
      metric: 'cost_usd',
      max: 2.0,
      warnAt: 1.5,
      enabled: true,
    });
    const check = assertWithinGuardrail('smoke.cost.per_run', 0.5);
    expect(check.allowed).toBe(true);
    expect(check.level).toBe('ok');
  });

  it('updates thresholds via the Pulse 18.18 seam', () => {
    registerGuardrail({
      id: 'smoke.concurrency',
      metric: 'concurrency',
      max: 50,
      warnAt: 40,
      enabled: true,
    });
    const updated = setGuardrailThreshold('smoke.concurrency', { max: 30 });
    expect(updated.max).toBe(30);
    const check = assertWithinGuardrail('smoke.concurrency', 45);
    expect(check.allowed).toBe(false);
  });

  it('lists registered guardrails', () => {
    registerGuardrail({
      id: 'smoke.list_check',
      metric: 'tokens',
      max: 100,
      warnAt: 80,
      enabled: true,
    });
    const all = listGuardrails();
    expect(Array.isArray(all)).toBe(true);
    expect(all.some((g) => g.id === 'smoke.list_check')).toBe(true);
  });
});

describe('Phase 5a — Tracing', () => {
  it('creates and ends spans', () => {
    const provider = getTraceProvider();
    const tracer = provider.getTracer();
    const span = tracer.startSpan('test-span', 'tool_span');
    span.setAttribute('key', 'value');
    span.addEvent('test-event');
    span.end();
    expect(span.id).toBeDefined();
    expect(span.traceId).toBeDefined();
  });

  it('nested span hierarchy', () => {
    const provider = getTraceProvider();
    const tracer = provider.getTracer();
    const parent = tracer.startSpan('parent', 'agent_span');
    const child = tracer.startSpan('child', 'tool_span', { parentId: parent.id });
    child.end();
    parent.end();
    expect(parent.id).not.toBe(child.id);
  });
});

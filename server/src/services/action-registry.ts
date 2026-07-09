import { z } from 'zod';
import { getAgent, authorizeToolCall } from './kernel.js';
import { recall } from './recall.js';
import { createMemory } from './memory.service.js';
import { createSkill } from './skill.service.js';
import { db, memories, skills } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { appendAudit } from '../lib/audit.js';

// ── Inline domain types (mirrors src/lib/os/types.ts) ──────────

export type Ring = 0 | 1 | 2 | 3 | 4;
export type RiskLevel = 'safe' | 'read' | 'write' | 'destructive' | 'network' | 'privileged';
export type ToolProvider = 'mcp' | 'cli' | 'http' | 'builtin';

export interface ToolSpec {
  name: string;
  description: string;
  provider: ToolProvider;
  scopesRequired: string[];
  riskLevel: RiskLevel;
  minRing: Ring;
  timeoutMs: number;
  retryable: boolean;
  approvalRequired: boolean;
}

// ── Core Action Types ──────────────────────────────────────────

export interface ActionExample {
  input: Record<string, unknown>;
  output: unknown;
  description: string;
}

export type ActionHandler = (
  input: Record<string, unknown>,
  context: ActionContext
) => Promise<unknown>;

export interface ActionContext {
  agentId: string;
  actor: string;
  traceId?: string;
  agentRing?: Ring;
}

export interface ActionMetadata {
  version: string;
  category?: string;
  provider?: 'builtin' | 'mcp' | 'cli' | 'http';
  riskLevel?: RiskLevel;
  minRing?: Ring;
  timeoutMs?: number;
}

export interface Action {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  validate?: (input: Record<string, unknown>) => { valid: boolean; errors?: string[] };
  handler: ActionHandler;
  similes: string[];
  examples: ActionExample[];
  metadata: ActionMetadata;
}

export interface ActionExecuteResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export class ActionRegistry {
  private actions: Map<string, Action> = new Map();

  register(action: Action): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" is already registered`);
    }
    this.actions.set(action.name, action);
  }

  unregister(name: string): boolean {
    return this.actions.delete(name);
  }

  get(name: string): Action | undefined {
    return this.actions.get(name);
  }

  list(): Action[] {
    return Array.from(this.actions.values());
  }

  find(query: string): Action[] {
    const q = query.toLowerCase();
    return this.list().filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.similes.some((s) => s.toLowerCase().includes(q))
    );
  }

  fuzzyFind(query: string): Action | undefined {
    const q = query.toLowerCase().trim();

    const exact = this.actions.get(q);
    if (exact) return exact;

    for (const action of this.actions.values()) {
      if (action.name.toLowerCase() === q) return action;
      for (const simile of action.similes) {
        if (simile.toLowerCase() === q) return action;
      }
    }

    const scored = this.list()
      .map((a) => {
        let score = 0;
        if (a.name.toLowerCase().includes(q)) score += 3;
        if (a.name.toLowerCase().startsWith(q)) score += 5;
        if (a.description.toLowerCase().includes(q)) score += 2;
        for (const s of a.similes) {
          if (s.toLowerCase().includes(q)) score += 2;
          if (s.toLowerCase().startsWith(q)) score += 3;
        }
        return { action: a, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.action;
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ActionContext,
    timeoutMs?: number
  ): Promise<ActionExecuteResult> {
    const action = this.actions.get(name);
    if (!action) {
      return { ok: false, error: `Action "${name}" not found in registry` };
    }

    return executeActionWithTimeout(action, input, context, timeoutMs ?? action.metadata.timeoutMs);
  }

  toToolSpecs(): ToolSpec[] {
    return this.list().map((a) => ({
      name: a.name,
      description: a.description,
      provider: (a.metadata.provider ?? 'builtin') as ToolSpec['provider'],
      scopesRequired: [],
      riskLevel: (a.metadata.riskLevel ?? 'read') as RiskLevel,
      minRing: (a.metadata.minRing ?? 2) as Ring,
      timeoutMs: a.metadata.timeoutMs ?? 15000,
      retryable: true,
      approvalRequired:
        a.metadata.riskLevel === 'destructive' || a.metadata.riskLevel === 'privileged',
    }));
  }
}

export async function executeActionWithTimeout(
  action: Action,
  input: Record<string, unknown>,
  context: ActionContext,
  timeoutMs: number = 15000
): Promise<ActionExecuteResult> {
  const start = performance.now();

  // 1. VALIDATE
  const parsed = action.schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrs = JSON.stringify(parsed.error.flatten().fieldErrors);
    return {
      ok: false,
      error: `Validation failed: ${fieldErrs}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  if (action.validate) {
    const v = action.validate(parsed.data);
    if (!v.valid) {
      return {
        ok: false,
        error: `Custom validation failed: ${v.errors?.join('; ') ?? 'unknown'}`,
        durationMs: Math.round(performance.now() - start),
      };
    }
  }

  // 2. AUTHORIZE
  try {
    let ring: number = context.agentRing ?? 2;
    if (context.agentId) {
      const agent = await getAgent(context.agentId);
      if (agent) {
        ring = agent.ring;
        if (['quarantined', 'paused', 'terminated'].includes(agent.status)) {
          return {
            ok: false,
            error: `Authorization failed: Agent ${context.agentId} is in status "${agent.status}" and cannot execute actions`,
            durationMs: Math.round(performance.now() - start),
          };
        }
      }
    }

    const authorized = await authorizeToolCall(
      context.agentId || 'unknown',
      ring,
      action.name,
      undefined,
      context.actor || 'system',
      action.metadata?.minRing
    );

    if (!authorized) {
      return {
        ok: false,
        error: `Authorization failed: ACL denied action "${action.name}" for ring ${ring}`,
        durationMs: Math.round(performance.now() - start),
      };
    }
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return {
      ok: false,
      error: `Authorization failed: ${msg}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  // 3. EXECUTE
  try {
    const result = await withTimeout(action.handler(parsed.data, context), timeoutMs);
    const durationMs = Math.round(performance.now() - start);

    // 4. AUDIT
    await appendAudit(
      'action.executed',
      {
        agentId: context.agentId,
        action: action.name,
        durationMs,
        ok: true,
        traceId: context.traceId,
      },
      context.actor || 'system'
    );

    return {
      ok: true,
      data: result,
      durationMs,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const durationMs = Math.round(performance.now() - start);

    // 4. AUDIT (failed execution)
    await appendAudit(
      'action.failed',
      {
        agentId: context.agentId,
        action: action.name,
        durationMs,
        ok: false,
        error: msg,
        traceId: context.traceId,
      },
      context.actor || 'system'
    );

    return {
      ok: false,
      error: msg,
      durationMs,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Action timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function zStr(desc?: string) {
  return desc ? z.string().describe(desc) : z.string();
}
defineHelper(zStr); // satisfy compiler logic if needed, but simple assignments work.
function zNum(desc?: string) {
  return desc ? z.number().describe(desc) : z.number();
}
defineHelper(zNum);

function defineHelper(fn: unknown) {
  return fn;
}

export function createDefaultActions(): Action[] {
  return [
    {
      name: 'recall',
      description: 'Search across all memories, skills, and notes by semantic meaning.',
      schema: z.object({
        query: z.string().describe('The search query'),
        budget: z.number().describe('Token budget (max 8192)').default(4000),
      }),
      handler: async (input, ctx) => {
        return recall(String(input.query ?? ''), Number(input.budget ?? 4000), ctx.actor);
      },
      similes: ['search', 'find', 'query', 'remember', 'lookup'],
      examples: [
        {
          input: { query: 'database connection details', budget: 2000 },
          output: { items: [{ title: 'DB_URL', content: 'postgresql://...' }], tokens: 120 },
          description: 'Recall memories matching a semantic query',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'memory',
        provider: 'builtin',
        riskLevel: 'read',
        minRing: 1,
        timeoutMs: 5000,
      },
    },
    {
      name: 'createMemory',
      description: 'Store a new durable memory.',
      schema: z.object({
        kind: z.enum(['episodic', 'semantic', 'preference', 'reflexion', 'fact']),
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional().default([]),
        importance: z.number().min(0).max(1).optional().default(0.5),
      }),
      handler: async (raw, ctx) => {
        const input = raw as {
          kind: string;
          title: string;
          content: string;
          tags?: string[];
          importance?: number;
        };
        return createMemory(
          {
            kind: input.kind,
            title: input.title,
            content: input.content,
            tags: input.tags ?? [],
            importance: input.importance ?? 0.5,
            source: 'agent-runtime',
            projectId: null,
          },
          ctx.actor
        );
      },
      similes: ['store', 'save', 'remember', 'write memory', 'record'],
      examples: [
        {
          input: {
            kind: 'semantic',
            title: 'API Key Location',
            content: 'The API key is stored in .env',
            importance: 0.8,
          },
          output: { id: 'mem_abc123', kind: 'semantic', title: 'API Key Location' },
          description: 'Create a new semantic memory',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'memory',
        provider: 'builtin',
        riskLevel: 'write',
        minRing: 1,
        timeoutMs: 5000,
      },
    },
    {
      name: 'createSkill',
      description: 'Create a new reusable skill from successful patterns.',
      schema: z.object({
        name: z.string(),
        title: z.string(),
        description: z.string(),
        content: z.string(),
        category: z.string().optional().default('general'),
        tags: z.array(z.string()).optional().default([]),
      }),
      handler: async (raw, ctx) => {
        const input = raw as {
          name: string;
          title: string;
          description: string;
          content: string;
          category?: string;
          tags?: string[];
        };
        return createSkill(
          {
            name: input.name,
            title: input.title,
            description: input.description,
            content: input.content,
            category: input.category ?? 'general',
            tags: input.tags ?? [],
            source: 'agent-runtime',
            trigger: null,
            projectId: null,
          },
          ctx.actor
        );
      },
      similes: ['learn', 'teach', 'save skill', 'record pattern'],
      examples: [
        {
          input: {
            name: 'git-commit',
            title: 'Git Commit Pattern',
            description: 'Standard git commit flow',
            content: "git add . && git commit -m 'message'",
          },
          output: { id: 'skl_abc123', name: 'git-commit' },
          description: 'Create a new skill from a successful pattern',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'skill',
        provider: 'builtin',
        riskLevel: 'write',
        minRing: 1,
        timeoutMs: 5000,
      },
    },
    {
      name: 'readMemory',
      description: 'Read the full content of a specific memory by ID.',
      schema: z.object({
        id: z.string().describe('Memory ID'),
      }),
      handler: async (raw) => {
        const input = raw as { id: string };
        const mem = await db.query.memories.findFirst({ where: eq(memories.id, input.id) });
        return mem ?? { error: 'Memory not found' };
      },
      similes: ['get memory', 'fetch memory', 'load memory'],
      examples: [
        {
          input: { id: 'mem_abc123' },
          output: { id: 'mem_abc123', kind: 'semantic', title: 'API Key Location', content: '...' },
          description: 'Read a memory by its ID',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'memory',
        provider: 'builtin',
        riskLevel: 'read',
        minRing: 2,
        timeoutMs: 3000,
      },
    },
    {
      name: 'readSkill',
      description: 'Read the full content of a specific skill by ID.',
      schema: z.object({
        id: z.string().describe('Skill ID'),
      }),
      handler: async (raw) => {
        const input = raw as { id: string };
        const skl = await db.query.skills.findFirst({ where: eq(skills.id, input.id) });
        return skl ?? { error: 'Skill not found' };
      },
      similes: ['get skill', 'fetch skill', 'load skill'],
      examples: [
        {
          input: { id: 'skl_abc123' },
          output: { id: 'skl_abc123', name: 'git-commit', content: '...' },
          description: 'Read a skill by its ID',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'skill',
        provider: 'builtin',
        riskLevel: 'read',
        minRing: 2,
        timeoutMs: 3000,
      },
    },
    {
      name: 'listAgents',
      description: 'List all active sub-agents and their statuses.',
      schema: z.object({}),
      handler: async () => {
        const { listAgents } = await import('./kernel.js');
        return listAgents();
      },
      similes: ['agents', 'sub agents', 'agent list', 'list sub agents'],
      examples: [
        {
          input: {},
          output: [{ id: 'agt_abc', name: 'worker-1', status: 'active' }],
          description: 'List all agents',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'system',
        provider: 'builtin',
        riskLevel: 'read',
        minRing: 2,
        timeoutMs: 3000,
      },
    },
    {
      name: 'finish',
      description: 'Complete the task with a final answer. Call this when the goal is achieved.',
      schema: z.object({
        answer: z.string().describe('The final answer or summary'),
      }),
      handler: async (raw) => {
        const input = raw as { answer: string };
        return { done: true, answer: input.answer };
      },
      similes: ['done', 'complete', 'stop', 'end task', 'finalize'],
      examples: [
        {
          input: { answer: 'Task completed successfully. The database was configured.' },
          output: { done: true },
          description: 'Finish the current task with a final answer',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'system',
        provider: 'builtin',
        riskLevel: 'read',
        minRing: 0,
        timeoutMs: 3000,
      },
    },
  ];
}

/**
 * services/agent-runtime.ts — Action Registry (syscalls) system.
 *
 * Replaces the hardcoded AVAILABLE_TOOLS / executeTool switch with a
 * composable Action interface. Inspired by Eliza's Action system.
 *
 * Architecture:
 *   Action        → self-contained unit with schema, validate, handler, similes
 *   ActionRegistry → registry of composable actions (register, find, execute)
 *   AgentRuntime   → runtime loop that discovers and executes actions
 *
 * Integration:
 *   - server/src/services/kernel.ts  → syscall dispatcher (tool.invoke)
 *   - server/src/lib/os/policy.ts  → TOOL_REGISTRY for action permissions
 *   - src/lib/os/types.ts   → domain models (Ring, ToolSpec, RiskLevel)
 */

import { z } from 'zod';
import { appendAudit } from '../lib/audit.js';
import { callLLM } from './llm.js';
import { recall } from './recall.js';
import { createMemory, createSkill } from '../services.js';

import {
  getAgent,
  incrementTokenUsage,
  listAgents,
  authorizeToolCall,
  pauseAgent,
} from './kernel.js';
import { db } from '../db/client.js';
import { memories, skills, agents } from '../db/client.js';
import { eq } from 'drizzle-orm';

// ── Inline domain types (mirrors src/lib/os/types.ts) ──────────

type Ring = 0 | 1 | 2 | 3 | 4;
type RiskLevel = 'safe' | 'read' | 'write' | 'destructive' | 'network' | 'privileged';
type ToolProvider = 'mcp' | 'cli' | 'http' | 'builtin';

interface ToolSpec {
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

// ── Action Registry ────────────────────────────────────────────

/**
 * Registry of composable actions (syscalls) that agents can discover and execute.
 * Supports exact lookup, fuzzy search by name/simile, and execution with timeout.
 */
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

  /**
   * Find an action by fuzzy matching against name, description, and similes.
   * Uses a scoring system that prioritizes exact matches and prefix matches.
   */
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

  /**
   * Execute a registered action by name with schema validation and timeout.
   * Returns an ActionExecuteResult with the outcome and duration.
   */
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

// ── Action Execution ───────────────────────────────────────────

export interface ActionExecuteResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

async function executeActionWithTimeout(
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

// ── Default Action Factory ─────────────────────────────────────

function zStr(desc?: string) {
  return desc ? z.string().describe(desc) : z.string();
}
function zNum(desc?: string) {
  return desc ? z.number().describe(desc) : z.number();
}

export function createDefaultActions(): Action[] {
  return [
    {
      name: 'recall',
      description: 'Search across all memories, skills, and notes by semantic meaning.',
      schema: z.object({
        query: zStr('The search query'),
        budget: zNum('Token budget (max 8192)').default(4000),
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
        title: zStr(),
        content: zStr(),
        tags: z.array(zStr()).optional().default([]),
        importance: zNum().min(0).max(1).optional().default(0.5),
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
        name: zStr(),
        title: zStr(),
        description: zStr(),
        content: zStr(),
        category: zStr().optional().default('general'),
        tags: z.array(zStr()).optional().default([]),
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
        id: zStr('Memory ID'),
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
        id: zStr('Skill ID'),
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
      name: 'browserNavigate',
      description: 'Navigate to a URL and extract page text.',
      schema: z.object({
        url: zStr('The URL to visit'),
      }),
      handler: async () => {
        return { error: 'Browser automation not available' };
      },
      similes: ['visit', 'open url', 'browse', 'fetch page', 'open page'],
      examples: [
        {
          input: { url: 'https://example.com' },
          output: { url: 'https://example.com', text: 'Page content...', title: 'Example' },
          description: 'Navigate to a URL and extract page text',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'browser',
        provider: 'builtin',
        riskLevel: 'network',
        minRing: 2,
        timeoutMs: 30000,
      },
    },
    {
      name: 'browserExtract',
      description: 'Extract text from a specific URL with optional CSS selector.',
      schema: z.object({
        url: zStr(),
        selector: zStr('CSS selector (optional)').optional().default('body'),
      }),
      handler: async () => {
        return { error: 'Browser automation not available' };
      },
      similes: ['extract', 'scrape', 'get text', 'parse page'],
      examples: [
        {
          input: { url: 'https://example.com/article', selector: 'main' },
          output: { url: 'https://example.com/article', text: 'Article content...' },
          description: 'Extract text with CSS selector',
        },
      ],
      metadata: {
        version: '1.0.0',
        category: 'browser',
        provider: 'builtin',
        riskLevel: 'network',
        minRing: 2,
        timeoutMs: 30000,
      },
    },
    {
      name: 'listAgents',
      description: 'List all active sub-agents and their statuses.',
      schema: z.object({}),
      handler: async () => {
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
        answer: zStr('The final answer or summary'),
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

// ── AgentConfig / AgentStep / AgentResult (preserved from v1) ──

export interface AgentConfig {
  agentId: string;
  goal: string;
  context?: Record<string, unknown>;
  maxIterations?: number;
  actor: string;
}

export interface AgentStep {
  iteration: number;
  thought: string;
  tool: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
}

export interface AgentResult {
  ok: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  tokensUsed: number;
  error?: string;
}

// ── Agent Runtime ──────────────────────────────────────────────

/**
 * Runtime loop that discovers and executes actions to fulfill a goal.
 * Wraps an ActionRegistry, builds a system prompt from registered actions,
 * and drives iterative LLM-in-the-loop execution.
 */
export class AgentRuntime {
  readonly registry: ActionRegistry;
  private actionContext: ActionContext;

  constructor(agentId: string, actor: string, actions?: Action[]) {
    this.registry = new ActionRegistry();
    this.actionContext = { agentId, actor };

    const defaults = createDefaultActions();
    for (const action of actions ?? defaults) {
      this.registry.register(action);
    }
  }

  registerAction(action: Action): void {
    this.registry.register(action);
  }

  executeAction(
    name: string,
    input: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<ActionExecuteResult> {
    return this.registry.execute(name, input, this.actionContext, timeoutMs);
  }

  validateAction(
    name: string,
    input: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const action = this.registry.get(name);
    if (!action) return { valid: false, errors: [`Action "${name}" not found`] };

    const parsed = action.schema.safeParse(input);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const errors = Object.entries(flat.fieldErrors).map(
        ([k, v]) => `${k}: ${(v ?? []).join(', ')}`
      );
      return { valid: false, errors };
    }

    if (action.validate) {
      return action.validate(parsed.data);
    }

    return { valid: true };
  }

  getAvailableActions(): Array<{
    name: string;
    description: string;
    schema: object;
    similes: string[];
    metadata: ActionMetadata;
  }> {
    return this.registry.list().map((a) => ({
      name: a.name,
      description: a.description,
      schema: JSON.parse(JSON.stringify(a.schema)),
      similes: a.similes,
      metadata: a.metadata,
    }));
  }

  buildSystemPrompt(): string {
    const tools = this.registry
      .list()
      .map((t) => {
        const shape = t.schema.shape;
        const props = Object.entries(shape)
          .map(([k, v]) => {
            const zodDef = (v as z.ZodTypeAny)._def;
            const desc = (zodDef as { description?: string })?.description ?? '';
            const isOptional = v instanceof z.ZodOptional || v instanceof z.ZodDefault;
            const requiredStr = isOptional ? ' (optional)' : ' (required)';
            return `    ${k}: ${desc}${requiredStr}`;
          })
          .join('\n');
        return `  - ${t.name}: ${t.description}\n${props}`;
      })
      .join('\n\n');

    return `You are NEXUS Agent Runtime — a reasoning agent that achieves goals by calling tools.

You have these tools available:

${tools}

Work through the goal step by step. For each step:
1. THINK about what to do next
2. CALL ONE tool with the correct arguments
3. OBSERVE the result and decide the next step

Respond in this JSON format:
{
  "thought": "Your reasoning about what to do next",
  "tool": "tool_name",
  "input": { "key": "value" }
}

When the goal is achieved, call the finish tool with your final answer.
Be concise and precise. If a tool fails, try an alternative approach.`;
  }
}

// ── Agent Process State Persistence & Recovery ──────────────────

export interface AgentExecutionState {
  agentId: string;
  goal: string;
  context?: Record<string, unknown>;
  currentIteration: number;
  maxIterations: number;
  steps: AgentStep[];
  tokensUsed: number;
  conversation: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'idle';
  updatedAt: string;
}

export async function saveAgentProcessState(state: AgentExecutionState): Promise<void> {
  const agent = await getAgent(state.agentId);
  if (!agent) return;

  const existingMeta = (agent.metadata ?? {}) as Record<string, unknown>;
  const updatedMeta = {
    ...existingMeta,
    executionState: state,
  };

  await db
    .update(agents)
    .set({
      metadata: updatedMeta,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, state.agentId));

  try {
    const { stateSnapshots } = await import('../db/client.js');
    const { randomUUID } = await import('node:crypto');
    await db.insert(stateSnapshots).values({
      id: `snap_${randomUUID()}`,
      sagaId: state.agentId,
      agentId: state.agentId,
      stepIndex: state.currentIteration,
      stepName: `step_${state.currentIteration}`,
      context: state as unknown as Record<string, unknown>,
      createdAt: new Date(),
    });
  } catch {
    // Fallback if snapshot table insert fails
  }
}

export async function loadAgentProcessState(agentId: string): Promise<AgentExecutionState | null> {
  const agent = await getAgent(agentId);
  if (!agent) return null;
  const meta = (agent.metadata ?? {}) as Record<string, unknown>;
  return (meta.executionState as AgentExecutionState) ?? null;
}

// ── Run Agent (refactored to use ActionRegistry & State Persistence) ──

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const { agentId, goal, actor, maxIterations = 15 } = config;
  const steps: AgentStep[] = [];
  let totalTokens = 0;

  const runtime = new AgentRuntime(agentId, actor);

  await appendAudit('agent_runtime.started', { agentId, goal, maxIterations }, actor);

  const systemPrompt = runtime.buildSystemPrompt();

  let conversation = `Goal: ${goal}\n\nContext: ${JSON.stringify(config.context ?? {})}\n\nBegin.`;

  // Restore previous execution state if present and agent is resuming
  const savedState = await loadAgentProcessState(agentId);
  let startIteration = 0;
  if (savedState && savedState.goal === goal && savedState.status === 'paused') {
    startIteration = savedState.currentIteration;
    steps.push(...savedState.steps);
    totalTokens = savedState.tokensUsed;
    if (savedState.conversation) {
      conversation = savedState.conversation;
    }
  }

  for (let i = startIteration; i < maxIterations; i++) {
    const agent = await getAgent(agentId);
    if (agent && (agent.tokensUsed >= agent.tokenBudget || agent.status === 'paused')) {
      if (agent.status !== 'paused') {
        await pauseAgent(agentId, actor);
      }
      const state: AgentExecutionState = {
        agentId,
        goal,
        context: config.context,
        currentIteration: i,
        maxIterations,
        steps,
        tokensUsed: agent ? agent.tokensUsed : totalTokens,
        conversation,
        status: 'paused',
        updatedAt: new Date().toISOString(),
      };
      await saveAgentProcessState(state);

      return {
        ok: false,
        answer: 'Token budget exhausted',
        steps,
        iterations: i,
        tokensUsed: agent ? agent.tokensUsed : totalTokens,
        error: `Token budget exhausted (${agent?.tokensUsed ?? totalTokens}/${agent?.tokenBudget ?? 0})`,
      };
    }

    // Persist current execution state snapshot
    await saveAgentProcessState({
      agentId,
      goal,
      context: config.context,
      currentIteration: i,
      maxIterations,
      steps,
      tokensUsed: totalTokens,
      conversation,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    try {
      const llmResult = await callLLM({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversation },
        ],
        temperature: 0.5,
        maxTokens: 1024,
      });

      totalTokens = await incrementTokenUsage(agentId, llmResult.usage.total, actor);

      const parsed = JSON.parse(llmResult.content);
      const thought = String(parsed.thought ?? '');
      const toolName = String(parsed.tool ?? '');
      const toolInput = (parsed.input ?? {}) as Record<string, unknown>;

      if (toolName === 'finish') {
        const answer = String(toolInput.answer ?? thought);
        steps.push({
          iteration: i,
          thought,
          tool: toolName,
          toolInput,
          toolOutput: { done: true },
        });

        const state: AgentExecutionState = {
          agentId,
          goal,
          context: config.context,
          currentIteration: i + 1,
          maxIterations,
          steps,
          tokensUsed: totalTokens,
          conversation,
          status: 'completed',
          updatedAt: new Date().toISOString(),
        };
        await saveAgentProcessState(state);

        await appendAudit(
          'agent_runtime.finished',
          {
            agentId,
            iterations: i + 1,
            tokensUsed: totalTokens,
            answerLength: answer.length,
          },
          actor
        );

        return { ok: true, answer, steps, iterations: i + 1, tokensUsed: totalTokens };
      }

      const result = await agentDispatchPool.run(() => runtime.executeAction(toolName, toolInput));
      const toolOutput = result.ok ? result.data : { error: result.error };
      steps.push({ iteration: i, thought, tool: toolName, toolInput, toolOutput });

      const outputStr =
        typeof toolOutput === 'object'
          ? JSON.stringify(toolOutput).slice(0, 4000)
          : String(toolOutput).slice(0, 4000);

      conversation = `Step ${i + 1} result:\nTool: ${toolName}\nOutput: ${outputStr}\n\nContinue working toward the goal. What is the next step?`;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      steps.push({
        iteration: i,
        thought: 'Error occurred',
        tool: '_error',
        toolInput: {},
        toolOutput: { error: errMsg },
      });

      if (i === maxIterations - 1) {
        const state: AgentExecutionState = {
          agentId,
          goal,
          context: config.context,
          currentIteration: i + 1,
          maxIterations,
          steps,
          tokensUsed: totalTokens,
          conversation,
          status: 'failed',
          updatedAt: new Date().toISOString(),
        };
        await saveAgentProcessState(state);

        await appendAudit(
          'agent_runtime.failed',
          {
            agentId,
            iterations: i + 1,
            error: errMsg,
          },
          actor
        );

        return {
          ok: false,
          answer: `Failed after ${i + 1} iterations: ${errMsg}`,
          steps,
          iterations: i + 1,
          tokensUsed: totalTokens,
          error: errMsg,
        };
      }

      conversation = `Step ${i + 1} error: ${errMsg}\n\nTry a different approach.`;
    }
  }

  const finalState: AgentExecutionState = {
    agentId,
    goal,
    context: config.context,
    currentIteration: maxIterations,
    maxIterations,
    steps,
    tokensUsed: totalTokens,
    conversation,
    status: 'failed',
    updatedAt: new Date().toISOString(),
  };
  await saveAgentProcessState(finalState);

  return {
    ok: false,
    answer: `Max iterations (${maxIterations}) reached without completing goal.`,
    steps,
    iterations: maxIterations,
    tokensUsed: totalTokens,
    error: 'Max iterations exceeded',
  };
}

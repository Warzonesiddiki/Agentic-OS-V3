import { z } from 'zod';
import {
  ActionRegistry,
  type Action,
  type ActionMetadata,
  type ActionExecuteResult,
  createDefaultActions,
} from './action-registry.js';
import { callLLM } from './llm.js';
import { appendAudit } from '../lib/audit.js';
import { getAgent, incrementTokenUsage, pauseAgent } from './kernel.js';
import {
  loadAgentProcessState,
  saveAgentProcessState,
  type AgentExecutionState,
} from './agent-persistence.js';

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

export class AgentRuntime {
  readonly registry: ActionRegistry;
  private actionContext: { agentId: string; actor: string };

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

      const result = await runtime.executeAction(toolName, toolInput);
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

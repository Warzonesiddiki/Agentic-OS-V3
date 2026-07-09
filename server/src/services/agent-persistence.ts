import { getAgent } from './kernel.js';
import { db, agents } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { type AgentStep } from './agent-loop.js';

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

/**
 * routes/a2a.ts — Hono router for Google Gemini CLI A2A Inter-Agent Protocol Server
 */

import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { ok, err } from '../lib/envelope.js';
import { appendAudit } from '../lib/audit.js';
import {
  getAgentCard,
  A2ATaskManager,
  verifyBearerToken,
  verifyRequestSignature,
  type A2ATask,
  type A2ATaskPayload,
  type A2ATaskStep,
  type A2ATaskEvent,
} from '@agentic-os/a2a-server';
import { runAgent } from '../services/agent-runtime.js';

export const a2aRouter = new Hono<NexusEnv>();
export const taskManager = new A2ATaskManager();

// Wire task execution to local Agent Runtime
taskManager.setTaskRunner(
  async (task: A2ATask, onStep: (step: A2ATaskStep) => void, onLog: (log: string) => void) => {
    onLog(`Spawning Agent Runtime for task ${task.id}...`);

    const config = {
      agentId: task.contextId || task.id,
      goal: task.goal,
      actor: task.actor || 'a2a-remote-agent',
      context: task.input,
    };

    const result = await runAgent(config);

    if (result.steps) {
      for (const step of result.steps) {
        const taskStep: A2ATaskStep = {
          iteration: step.iteration,
          thought: step.thought,
          tool: step.tool,
          toolInput: step.toolInput,
          toolOutput: step.toolOutput,
        };
        onStep(taskStep);
        onLog(`Executed step ${step.iteration}: tool=${step.tool}`);
      }
    }

    await appendAudit(
      'a2a.task_completed',
      {
        taskId: task.id,
        goal: task.goal,
        ok: result.ok,
        iterations: result.iterations,
        tokensUsed: result.tokensUsed,
      },
      task.actor
    );

    if (!result.ok) {
      throw new Error(result.error || 'Agent Runtime execution failed');
    }

    return { answer: result.answer, steps: result.steps, tokensUsed: result.tokensUsed };
  }
);

// ── Standard /.well-known/agent.json Discovery ────────────────
a2aRouter.get('/.well-known/agent.json', (c) => {
  const url = `${c.req.url.split('/.well-known')[0]}/`;
  const card = getAgentCard(url);
  return c.json(card);
});

a2aRouter.get('/.well-known/agent-card.json', (c) => {
  const url = `${c.req.url.split('/.well-known')[0]}/`;
  const card = getAgentCard(url);
  return c.json(card);
});

// ── Local Agent Discovery ──────────────────────────────────────
a2aRouter.get('/api/v1/a2a/agents', async (c) => {
  const card = getAgentCard();
  const agents = [
    {
      id: 'nexus-primary-agent',
      name: card.name,
      description: card.description,
      capabilities: card.capabilities,
      skills: card.skills,
      status: 'active',
    },
  ];
  return c.json(ok({ agents, card }, c.get('requestId') ?? ''));
});

// ── Task Creation ──────────────────────────────────────────────
a2aRouter.post('/api/v1/a2a/tasks', async (c) => {
  const authHeader = c.req.header('authorization');
  const signatureHeader = c.req.header('x-a2a-signature');

  const expectedToken = process.env.A2A_BEARER_TOKEN;
  const signatureSecret = process.env.A2A_SIGNATURE_SECRET;

  const authCheck = verifyBearerToken(authHeader, expectedToken);
  if (!authCheck.valid) {
    return c.json(
      err('UNAUTHORIZED', authCheck.error || 'Unauthorized', c.get('requestId') ?? ''),
      401
    );
  }

  let body: A2ATaskPayload;
  try {
    body = await c.req.json<A2ATaskPayload>();
  } catch {
    return c.json(err('BAD_REQUEST', 'Invalid JSON body', c.get('requestId') ?? ''), 400);
  }

  if (!body.goal || typeof body.goal !== 'string') {
    return c.json(
      err(
        'BAD_REQUEST',
        'Field "goal" is required and must be a string.',
        c.get('requestId') ?? ''
      ),
      400
    );
  }

  const sigCheck = verifyRequestSignature(body, signatureHeader, signatureSecret);
  if (!sigCheck.valid) {
    return c.json(
      err('UNAUTHORIZED', sigCheck.error || 'Invalid signature', c.get('requestId') ?? ''),
      401
    );
  }

  const task = taskManager.createTask(body);

  await appendAudit(
    'a2a.task_created',
    {
      taskId: task.id,
      contextId: task.contextId,
      goal: task.goal,
      actor: task.actor,
    },
    task.actor
  );

  return c.json(
    ok(
      {
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
        task,
      },
      c.get('requestId') ?? ''
    ),
    201
  );
});

// ── Task Status ────────────────────────────────────────────────
a2aRouter.get('/api/v1/a2a/tasks/:id', (c) => {
  const taskId = c.req.param('id');
  const task = taskManager.getTask(taskId);

  if (!task) {
    return c.json(
      err('NOT_FOUND', `A2A Task "${taskId}" not found.`, c.get('requestId') ?? ''),
      404
    );
  }

  return c.json(ok(task, c.get('requestId') ?? ''));
});

// ── Task SSE Progress Streaming ────────────────────────────────
a2aRouter.get('/api/v1/a2a/tasks/:id/stream', (c) => {
  const taskId = c.req.param('id');
  const task = taskManager.getTask(taskId);

  if (!task) {
    return c.json(
      err('NOT_FOUND', `A2A Task "${taskId}" not found.`, c.get('requestId') ?? ''),
      404
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (eventData: unknown) => {
        try {
          const chunk = `data: ${JSON.stringify(eventData)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // stream might be closed
        }
      };

      // Send initial status as first event
      sendEvent({ type: 'task.initial', taskId: task.id, timestamp: Date.now(), data: task });

      const unsubscribe = taskManager.subscribe(taskId, (event: A2ATaskEvent) => {
        sendEvent(event);
        if (event.type === 'task.completed' || event.type === 'task.failed') {
          try {
            controller.close();
          } catch {
            /* closed */
          }
        }
      });

      const rawReq = c.req.raw as unknown as { on?: (event: string, fn: () => void) => void };
      if (rawReq && typeof rawReq.on === 'function') {
        rawReq.on('close', () => {
          unsubscribe();
        });
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

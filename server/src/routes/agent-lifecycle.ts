/**
 * routes/agent-lifecycle.ts — Agent Lifecycle API (Phase 2c).
 *
 * State machine: CREATED → RUNNING → PAUSED → RUNNING → TERMINATED
 *
 * Routes:
 *   POST /api/v3/agents/spawn         — Create and start a new agent
 *   POST /api/v3/agents/:id/pause     — Pause a running agent
 *   POST /api/v3/agents/:id/resume    — Resume a paused agent
 *   POST /api/v3/agents/:id/kill      — Terminate an agent
 *   GET  /api/v3/agents/:id/state     — Get agent state
 *   GET  /api/v3/agents               — List all agents
 *   GET  /api/v3/agents/:id/tasks     — List agent tasks
 *
 * Integrates with services/kernel.ts for core operations and
 * services/signal-hooks.ts for lifecycle event emission.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { NexusEnv } from "../lib/hono-env.js";
import { requireScope, safeJson, parse } from "../lib/auth-context.js";
import { ok, err } from "../lib/envelope.js";
import {
  spawnAgent, listAgents, getAgent,
  pauseAgent, resumeAgent, terminateAgent,
  getAgentState, listAgentTasks,
} from "../services/kernel.js";
import { emitSignal } from "../services/signal-hooks.js";

export const agentLifecycle = new Hono<NexusEnv>();

agentLifecycle.post("/api/v3/agents/spawn", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const body = parse(z.object({
    name: z.string().min(1).max(80),
    kind: z.enum(["sub-agent", "daemon"]).default("sub-agent"),
    parentId: z.string().optional(),
    ring: z.number().int().min(0).max(4).default(2),
    scopes: z.array(z.string()).default([]),
    llmModel: z.string().optional(),
    tokenBudget: z.number().int().positive().default(100000),
    timeoutMs: z.number().int().positive().default(120000),
    goal: z.string().optional(),
  }), await safeJson(c));

  const agent = await spawnAgent(body, p.id);
  if (!agent) return c.json(err("INTERNAL_ERROR", "Failed to spawn agent.", c.get("requestId") ?? ""), 500);

  await emitSignal("on_agent_start", {
    agentId: agent.id,
    goal: body.goal ?? agent.name,
    parentId: agent.parentId ?? undefined,
    actor: p.id,
    timestamp: Date.now(),
  });

  return c.json(ok(agent, c.get("requestId") ?? ""), 201);
});

agentLifecycle.post("/api/v3/agents/:id/pause", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const id = c.req.param("id");

  const existing = await getAgent(id);
  if (!existing) return c.json(err("NOT_FOUND", "Agent not found.", c.get("requestId") ?? ""), 404);
  if (existing.status === "paused") return c.json(err("CONFLICT", "Agent is already paused.", c.get("requestId") ?? ""), 409);
  if (existing.status === "terminated") return c.json(err("CONFLICT", "Cannot pause a terminated agent.", c.get("requestId") ?? ""), 409);

  const updated = await pauseAgent(id, p.id);
  if (!updated) return c.json(err("INTERNAL_ERROR", "Failed to pause agent.", c.get("requestId") ?? ""), 500);

  return c.json(ok(updated, c.get("requestId") ?? ""));
});

agentLifecycle.post("/api/v3/agents/:id/resume", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const id = c.req.param("id");

  const existing = await getAgent(id);
  if (!existing) return c.json(err("NOT_FOUND", "Agent not found.", c.get("requestId") ?? ""), 404);
  if (existing.status !== "paused") return c.json(err("CONFLICT", "Only paused agents can be resumed.", c.get("requestId") ?? ""), 409);

  const updated = await resumeAgent(id, p.id);
  if (!updated) return c.json(err("CONFLICT", "Agent is not in paused state.", c.get("requestId") ?? ""), 409);

  return c.json(ok(updated, c.get("requestId") ?? ""));
});

agentLifecycle.post("/api/v3/agents/:id/kill", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const id = c.req.param("id");

  const body = parse(z.object({
    reason: z.string().default("Manual termination"),
  }), await safeJson(c));

  const existing = await getAgent(id);
  if (!existing) return c.json(err("NOT_FOUND", "Agent not found.", c.get("requestId") ?? ""), 404);
  if (existing.status === "terminated") return c.json(err("CONFLICT", "Agent is already terminated.", c.get("requestId") ?? ""), 409);

  const updated = await terminateAgent(id, body.reason as string, p.id);
  if (!updated) return c.json(err("INTERNAL_ERROR", "Failed to terminate agent.", c.get("requestId") ?? ""), 500);

  await emitSignal("on_agent_end", {
    agentId: id,
    ok: false,
    answer: `Terminated: ${body.reason}`,
    iterations: 0,
    tokensUsed: existing.tokensUsed,
    error: body.reason,
    timestamp: Date.now(),
  });

  return c.json(ok(updated, c.get("requestId") ?? ""));
});

agentLifecycle.get("/api/v3/agents/:id/state", async (c) => {
  await requireScope(c, "memory:read");
  const id = c.req.param("id");

  const state = await getAgentState(id);
  if (!state) return c.json(err("NOT_FOUND", "Agent not found.", c.get("requestId") ?? ""), 404);

  return c.json(ok(state, c.get("requestId") ?? ""));
});

agentLifecycle.get("/api/v3/agents", async (c) => {
  await requireScope(c, "memory:read");
  const status = c.req.query("status") || undefined;
  const parentId = c.req.query("parentId") || undefined;

  const items = await listAgents(status || parentId ? { status, parentId } : undefined);
  return c.json(ok({ items }, c.get("requestId") ?? ""));
});

agentLifecycle.get("/api/v3/agents/:id/tasks", async (c) => {
  await requireScope(c, "memory:read");
  const id = c.req.param("id");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));

  const existing = await getAgent(id);
  if (!existing) return c.json(err("NOT_FOUND", "Agent not found.", c.get("requestId") ?? ""), 404);

  const tasks = await listAgentTasks(id, limit);
  return c.json(ok({ items: tasks }, c.get("requestId") ?? ""));
});

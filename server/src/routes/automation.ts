/**
 * routes/automation.ts — Browser automation, HITL approval gates, workspace sync.
 */
import { Hono } from "hono";
import type { NexusEnv } from "../lib/hono-env.js";
import { requireScope, safeJson, parse } from "../lib/auth-context.js";
import { z } from "zod";
import { browserNavigate, browserClick, browserExtract, browserScreenshot } from "../services/browser.js";
import { requestApproval, resolveApproval } from "../services/operations-ext.js";
import { syncWorkspace } from "../services/workspace-sync.js";
import { safeVaultPath } from "../lib/guards.js";
import { broadcastSSE } from "../services/bus.js";
import { ok, err } from "../lib/envelope.js";

export const automation = new Hono<NexusEnv>();

// Browser automation
automation.post("/api/v1/browser/navigate", async (c) => {
  const p = await requireScope(c, "memory:write");
  const body = parse(z.object({ url: z.string().url(), agentId: z.string() }), await safeJson(c));
  return c.json(ok(await browserNavigate(body.url, body.agentId, p.id), c.get("requestId") ?? ""));
});

automation.post("/api/v1/browser/click", async (c) => {
  const p = await requireScope(c, "memory:write");
  const body = parse(z.object({ url: z.string().url(), selector: z.string(), agentId: z.string() }), await safeJson(c));
  return c.json(ok(await browserClick(body.url, body.selector, body.agentId, p.id), c.get("requestId") ?? ""));
});

automation.post("/api/v1/browser/extract", async (c) => {
  const p = await requireScope(c, "memory:read");
  const body = parse(z.object({ url: z.string().url(), selector: z.string().optional(), agentId: z.string() }), await safeJson(c));
  return c.json(ok(await browserExtract(body.url, body.selector ?? "", body.agentId, p.id), c.get("requestId") ?? ""));
});

automation.post("/api/v1/browser/screenshot", async (c) => {
  const p = await requireScope(c, "memory:read");
  const body = parse(z.object({ url: z.string().url(), agentId: z.string() }), await safeJson(c));
  return c.json(ok(await browserScreenshot(body.url, body.agentId, p.id), c.get("requestId") ?? ""));
});

// HITL approvals
automation.post("/api/v1/approvals/request", async (c) => {
  const p = await requireScope(c, "memory:write");
  const body = parse(z.object({
    agentId: z.string(), taskId: z.string(), tool: z.string(),
    riskLevel: z.string(), payload: z.unknown(), reasoning: z.string(),
  }), await safeJson(c));
  const result = await requestApproval(body as Parameters<typeof requestApproval>[0], p.id);
  broadcastSSE({ type: "approval.requested", data: { ...result, ...body }, timestamp: Date.now() });
  return c.json(ok(result, c.get("requestId") ?? ""), 201);
});

automation.post("/api/v1/approvals/resolve", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const body = parse(z.object({ taskId: z.string(), approved: z.boolean() }), await safeJson(c));
  await resolveApproval(body.taskId, body.approved, p.id);
  broadcastSSE({ type: "task.update", data: { id: body.taskId, approved: body.approved }, timestamp: Date.now() });
  return c.json(ok({ resolved: true, approved: body.approved }, c.get("requestId") ?? ""));
});

// Workspace sync
automation.post("/api/v1/workspace/sync", async (c) => {
  const p = await requireScope(c, "brain:admin");
  const body = parse(z.object({ dir: z.string().default(process.cwd()) }), await safeJson(c));
  const dir = body.dir || process.cwd();
  const safe = safeVaultPath(dir, process.cwd());
  if (!safe.ok) return c.json(err("VALIDATION_ERROR", `Invalid directory: ${safe.reason ?? "path traversal"}`, c.get("requestId") ?? ""), 400);
  return c.json(ok(await syncWorkspace(safe.resolved!, p.id), c.get("requestId") ?? ""));
});

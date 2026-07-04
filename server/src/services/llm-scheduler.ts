/**
 * services/llm-scheduler.ts — LLM Resource Scheduler.
 *
 * Phase 4c implementation providing:
 *   - Per-user rate limits (requests per minute, tokens per minute)
 *   - Priority queues (interactive > background > maintenance)
 *   - Model routing (task type → model mapping)
 *   - Token budget tracking and enforcement
 *   - Concurrent request limiting per user/agent
 *   - Queue depth monitoring and metrics
 *   - Request queuing with timeout
 *   - Cost tracking per request
 *
 * Integrates with server/src/services/kernel.ts (agent task scheduling),
 * server/src/services/llm-router.ts (model routing), and the existing
 * agent orchestration system.
 */
import { randomUUID } from "node:crypto";

import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";
import { getEnv } from "../lib/env.js";
import { estimateTokens } from "../lib/tokens.js";
// import { eq, sql, and, lt, gte } from "drizzle-orm";  // removed unused

// ── Priority Levels ──────────────────────────────────────────────

export type SchedulerPriority = "interactive" | "background" | "maintenance";

export const PRIORITY_ORDER: Record<SchedulerPriority, number> = {
  interactive: 100,
  background: 60,
  maintenance: 20,
};

// ── Model Routing ────────────────────────────────────────────────

export type TaskCategory =
  | "chat"
  | "reasoning"
  | "extraction"
  | "embedding"
  | "vision"
  | "code"
  | "distillation"
  | "tool_call";

export interface ModelRoute {
  category: TaskCategory;
  model: string;
  maxTokens: number;
  temperature: number;
  costPer1kPrompt: number;
  costPer1kCompletion: number;
}

const DEFAULT_ROUTES: ModelRoute[] = [
  { category: "chat",         model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.7, costPer1kPrompt: 0.15,   costPer1kCompletion: 0.60 },
  { category: "reasoning",    model: "gpt-4o",       maxTokens: 4096, temperature: 0.3, costPer1kPrompt: 2.50,   costPer1kCompletion: 10.00 },
  { category: "extraction",   model: "gpt-4o-mini", maxTokens: 1024, temperature: 0.1, costPer1kPrompt: 0.15,   costPer1kCompletion: 0.60 },
  { category: "embedding",    model: "text-embedding-3-small", maxTokens: 8191, temperature: 0.0, costPer1kPrompt: 0.02, costPer1kCompletion: 0.00 },
  { category: "vision",       model: "gpt-4o",       maxTokens: 4096, temperature: 0.5, costPer1kPrompt: 2.50,   costPer1kCompletion: 10.00 },
  { category: "code",         model: "gpt-4o",       maxTokens: 4096, temperature: 0.2, costPer1kPrompt: 2.50,   costPer1kCompletion: 10.00 },
  { category: "distillation", model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.3, costPer1kPrompt: 0.15,   costPer1kCompletion: 0.60 },
  { category: "tool_call",    model: "gpt-4o-mini", maxTokens: 1024, temperature: 0.0, costPer1kPrompt: 0.15,   costPer1kCompletion: 0.60 },
];

// ── Rate Limit Configuration ─────────────────────────────────────

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  concurrency: number;
  priority: SchedulerPriority;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  default: { rpm: 60, tpm: 100_000, concurrency: 5, priority: "background" },
  interactive: { rpm: 120, tpm: 200_000, concurrency: 10, priority: "interactive" },
  background: { rpm: 30, tpm: 50_000, concurrency: 3, priority: "background" },
  maintenance: { rpm: 10, tpm: 20_000, concurrency: 1, priority: "maintenance" },
};

// ── Token Budget ─────────────────────────────────────────────────

export interface TokenBudget {
  userId: string;
  budget: number;
  used: number;
  resetAt: number;
}

// ── Cost Tracking ────────────────────────────────────────────────

export interface CostRecord {
  requestId: string;
  userId: string;
  agentId: string;
  model: string;
  category: TaskCategory;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  timestamp: number;
}

// ── Scheduler Metrics ────────────────────────────────────────────

export interface SchedulerMetrics {
  queueDepth: number;
  running: number;
  processed: number;
  failed: number;
  timedOut: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokensProcessed: number;
  totalCost: number;
  byPriority: Record<SchedulerPriority, { queued: number; running: number }>;
}

// ── Scheduled Request ────────────────────────────────────────────

export interface ScheduledRequest {
  id: string;
  userId: string;
  agentId: string;
  category: TaskCategory;
  priority: SchedulerPriority;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  status: "queued" | "running" | "completed" | "failed" | "timed_out" | "cancelled";
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  timeoutMs: number;
  result?: unknown;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  traceId?: string;
}

// ── In-Memory State ──────────────────────────────────────────────

interface RateLimitBucket {
  requests: number[];
  tokens: number[];
}

interface UserState {
  rateLimit: RateLimitConfig;
  budget: TokenBudget;
  running: Set<string>;
  bucket: RateLimitBucket;
}

const state = {
  queue: [] as ScheduledRequest[],
  users: new Map<string, UserState>(),
  routes: [...DEFAULT_ROUTES] as ModelRoute[],
  metrics: {
    processed: 0,
    failed: 0,
    timedOut: 0,
    totalLatencyMs: 0,
    latencySamples: [] as number[],
    tokensProcessed: 0,
    totalCost: 0,
  },
  costLog: [] as CostRecord[],
  processing: false,
  tickTimer: null as ReturnType<typeof setInterval> | null,
};

// ── Helpers ──────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function rid(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function userIdKey(userId: string): string {
  return userId;
}

function getOrCreateUser(userId: string, priority?: SchedulerPriority): UserState {
  const key = userIdKey(userId);
  const existing = state.users.get(key);
  if (existing) return existing;

  const cfg = getDefaultRateLimit(priority);
  const us: UserState = {
    rateLimit: { ...cfg },
    budget: { userId, budget: cfg.tpm, used: 0, resetAt: now() + 60_000 },
    running: new Set(),
    bucket: { requests: [], tokens: [] },
  };
  state.users.set(key, us);
  return us;
}

function getDefaultRateLimit(priority?: SchedulerPriority): RateLimitConfig {
  const key = priority ?? "default";
  return (DEFAULT_RATE_LIMITS[key] ?? DEFAULT_RATE_LIMITS.default)!;
}

function pickModelRoute(category: TaskCategory): ModelRoute {
  const env = getEnv();
  const overrides: Partial<Record<TaskCategory, string>> = {};
  if (env.NEXUS_LLM_SIMPLE_MODEL) {
    overrides.chat = env.NEXUS_LLM_SIMPLE_MODEL;
    overrides.extraction = env.NEXUS_LLM_SIMPLE_MODEL;
    overrides.tool_call = env.NEXUS_LLM_SIMPLE_MODEL;
  }
  if (env.NEXUS_LLM_MEDIUM_MODEL) {
    overrides.reasoning = env.NEXUS_LLM_MEDIUM_MODEL;
    overrides.code = env.NEXUS_LLM_MEDIUM_MODEL;
  }
  if (env.NEXUS_LLM_COMPLEX_MODEL) {
    overrides.vision = env.NEXUS_LLM_COMPLEX_MODEL;
  }

  const found = state.routes.find((r) => r.category === category);
  if (!found) return state.routes[0]!;

  const modelOverride = overrides[category];
  if (modelOverride) {
    return { ...found, model: modelOverride };
  }

  return found;
}

function computeCost(promptTokens: number, completionTokens: number, route: ModelRoute): number {
  const promptCost = (promptTokens / 1000) * route.costPer1kPrompt;
  const completionCost = (completionTokens / 1000) * route.costPer1kCompletion;
  return promptCost + completionCost;
}

function slideWindow(bucket: RateLimitBucket, windowMs: number): void {
  const cutoff = now() - windowMs;
  bucket.requests = bucket.requests.filter((t) => t > cutoff);
  bucket.tokens = bucket.tokens.filter((t) => t > cutoff);
}

function checkRateLimit(us: UserState, tokens: number): { allowed: boolean; reason?: string } {
  slideWindow(us.bucket, 60_000);

  if (us.bucket.requests.length >= us.rateLimit.rpm) {
    return { allowed: false, reason: `RPM limit ${us.rateLimit.rpm}/min` };
  }

  const tokenCount = us.bucket.tokens.length;
  if (tokenCount + tokens > us.rateLimit.tpm) {
    return { allowed: false, reason: `TPM limit ${us.rateLimit.tpm}/min` };
  }

  if (us.running.size >= us.rateLimit.concurrency) {
    return { allowed: false, reason: `Concurrency limit ${us.rateLimit.concurrency}` };
  }

  if (us.budget.used + tokens > us.budget.budget) {
    return { allowed: false, reason: `Token budget ${us.budget.budget} exhausted` };
  }

  return { allowed: true };
}

// ── Queue Operations ─────────────────────────────────────────────

export function enqueue(req: Omit<ScheduledRequest, "id" | "status" | "queuedAt">): ScheduledRequest {
  const request: ScheduledRequest = {
    ...req,
    id: rid("sched"),
    status: "queued",
    queuedAt: now(),
  };

  state.queue.push(request);
  state.queue.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 0;
    const pb = PRIORITY_ORDER[b.priority] ?? 0;
    if (pa !== pb) return pb - pa;
    return a.queuedAt - b.queuedAt;
  });

  log.info("llm_scheduler.enqueued", {
    id: request.id,
    userId: request.userId,
    agentId: request.agentId,
    category: request.category,
    priority: request.priority,
    queueDepth: state.queue.length,
  });

  return request;
}

export function dequeue(): ScheduledRequest | null {
  if (state.queue.length === 0) return null;
  return state.queue.shift() ?? null;
}

export function peek(): ScheduledRequest | null {
  if (state.queue.length === 0) return null;
  return state.queue[0] ?? null;
}

export function cancelRequest(id: string): boolean {
  const idx = state.queue.findIndex((r) => r.id === id);
  if (idx === -1) return false;

  const removed = state.queue.splice(idx, 1);
  const req = removed[0];
  if (!req) return false;

  req.status = "cancelled";
  req.finishedAt = now();

  log.info("llm_scheduler.cancelled", { id: req.id, userId: req.userId });
  return true;
}

// ── Core Scheduler Logic ─────────────────────────────────────────

function drainTimedOut(): number {
  const cutoff = now();
  const timedOut: ScheduledRequest[] = [];
  const remaining: ScheduledRequest[] = [];

  for (const req of state.queue) {
    if (req.status === "queued" && cutoff - req.queuedAt >= req.timeoutMs) {
      req.status = "timed_out";
      req.finishedAt = cutoff;
      req.error = `Request timed out after ${req.timeoutMs}ms`;
      timedOut.push(req);
    } else {
      remaining.push(req);
    }
  }

  state.queue = remaining;
  state.metrics.timedOut += timedOut.length;
  return timedOut.length;
}

function _adoptTimedOutForUser(userId: string): number {
  const cutoff = now();
  let count = 0;
  state.queue = state.queue.filter((req) => {
    if (
      req.userId === userId &&
      req.status === "running" &&
      req.startedAt &&
      cutoff - req.startedAt >= req.timeoutMs
    ) {
      req.status = "timed_out";
      req.finishedAt = cutoff;
      req.error = `Execution timed out after ${req.timeoutMs}ms`;
      state.metrics.timedOut++;
      count++;
      return false;
    }
    return true;
  });
  return count;
}

export async function schedule(req: {
  userId: string;
  agentId: string;
  category: TaskCategory;
  priority?: SchedulerPriority;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  traceId?: string;
}): Promise<ScheduledRequest> {
  const route = pickModelRoute(req.category);
  const priority = req.priority ?? "background";
  const us = getOrCreateUser(req.userId, priority);

  const estimatedTokens = estimateTokens(req.prompt) + (req.maxTokens ?? route.maxTokens);

  const rateCheck = checkRateLimit(us, estimatedTokens);
  if (!rateCheck.allowed) {
    const scheduled = enqueue({
      userId: req.userId,
      agentId: req.agentId,
      category: req.category,
      priority,
      model: route.model,
      prompt: req.prompt,
      maxTokens: req.maxTokens ?? route.maxTokens,
      temperature: req.temperature ?? route.temperature,
      timeoutMs: req.timeoutMs ?? 60_000,
      traceId: req.traceId,
    });

    await appendAudit("llm_scheduler.queued", {
      id: scheduled.id,
      userId: req.userId,
      agentId: req.agentId,
      category: req.category,
      priority,
      reason: rateCheck.reason,
    }, "llm-scheduler");

    return scheduled;
  }

  us.running.add(req.agentId);
  us.bucket.requests.push(now());
  us.bucket.tokens.push(estimatedTokens);
  us.budget.used += estimatedTokens;

  const scheduled: ScheduledRequest = {
    id: rid("sched"),
    userId: req.userId,
    agentId: req.agentId,
    category: req.category,
    priority,
    model: route.model,
    prompt: req.prompt,
    maxTokens: req.maxTokens ?? route.maxTokens,
    temperature: req.temperature ?? route.temperature,
    status: "running",
    queuedAt: now(),
    startedAt: now(),
    timeoutMs: req.timeoutMs ?? 60_000,
    traceId: req.traceId,
  };

  await appendAudit("llm_scheduler.scheduled", {
    id: scheduled.id,
    userId: req.userId,
    agentId: req.agentId,
    category: req.category,
    priority,
    model: route.model,
  }, "llm-scheduler");

  return scheduled;
}

export function cancel(userId: string, requestId: string): boolean {
  const us = state.users.get(userIdKey(userId));
  if (us) {
    us.running.delete(requestId);
  }

  return cancelRequest(requestId);
}

export function complete(requestId: string, result: unknown, usage: { promptTokens: number; completionTokens: number }): void {
  const req = state.queue.find((r) => r.id === requestId);
  if (!req) return;

  req.status = "completed";
  req.finishedAt = now();
  req.result = result;
  req.promptTokens = usage.promptTokens;
  req.completionTokens = usage.completionTokens;

  const route = pickModelRoute(req.category);
  req.cost = computeCost(usage.promptTokens, usage.completionTokens, route);

  const us = state.users.get(userIdKey(req.userId));
  if (us) {
    us.running.delete(req.agentId);
  }

  state.metrics.processed++;
  state.metrics.tokensProcessed += usage.promptTokens + usage.completionTokens;
  state.metrics.totalCost += req.cost;
  state.metrics.totalLatencyMs += (req.finishedAt - (req.startedAt ?? req.queuedAt));
  state.metrics.latencySamples.push(req.finishedAt - (req.startedAt ?? req.queuedAt));

  state.costLog.push({
    requestId,
    userId: req.userId,
    agentId: req.agentId,
    model: req.model,
    category: req.category,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cost: req.cost,
    timestamp: now(),
  });

  log.info("llm_scheduler.completed", {
    id: requestId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cost: req.cost,
    latencyMs: req.finishedAt - (req.startedAt ?? req.queuedAt),
  });
}

export function fail(requestId: string, error: string): void {
  const req = state.queue.find((r) => r.id === requestId);
  if (!req) return;

  req.status = "failed";
  req.finishedAt = now();
  req.error = error;

  const us = state.users.get(userIdKey(req.userId));
  if (us) {
    us.running.delete(req.agentId);
  }

  state.metrics.failed++;

  log.warn("llm_scheduler.failed", { id: requestId, error });
}

// ── Status & Metrics ─────────────────────────────────────────────

export function getStatus(): {
  queueDepth: number;
  running: number;
  byPriority: Record<SchedulerPriority, { queued: number; running: number }>;
} {
  const byPriority: Record<SchedulerPriority, { queued: number; running: number }> = {
    interactive: { queued: 0, running: 0 },
    background: { queued: 0, running: 0 },
    maintenance: { queued: 0, running: 0 },
  };

  for (const req of state.queue) {
    if (req.status === "queued") {
      byPriority[req.priority]!.queued++;
    } else if (req.status === "running") {
      byPriority[req.priority]!.running++;
    }
  }

  return {
    queueDepth: state.queue.filter((r) => r.status === "queued").length,
    running: state.queue.filter((r) => r.status === "running").length,
    byPriority,
  };
}

export function getMetrics(): SchedulerMetrics {
  const status = getStatus();
  const samples = state.metrics.latencySamples;
  const avgLatencyMs = samples.length > 0
    ? Math.round(state.metrics.totalLatencyMs / samples.length)
    : 0;

  const sorted = [...samples].sort((a, b) => a - b);
  const p95Idx = Math.ceil(sorted.length * 0.95) - 1;
  const p95LatencyMs = p95Idx >= 0 ? sorted[p95Idx]! : 0;

  return {
    queueDepth: status.queueDepth,
    running: status.running,
    processed: state.metrics.processed,
    failed: state.metrics.failed,
    timedOut: state.metrics.timedOut,
    avgLatencyMs,
    p95LatencyMs,
    tokensProcessed: state.metrics.tokensProcessed,
    totalCost: state.metrics.totalCost,
    byPriority: status.byPriority,
  };
}

export function getUserStatus(userId: string): {
  rateLimit: RateLimitConfig;
  budget: { used: number; budget: number };
  running: number;
  queued: number;
} | null {
  const us = state.users.get(userIdKey(userId));
  if (!us) return null;

  const queued = state.queue.filter(
    (r) => r.userId === userId && r.status === "queued"
  ).length;

  return {
    rateLimit: us.rateLimit,
    budget: { used: us.budget.used, budget: us.budget.budget },
    running: us.running.size,
    queued,
  };
}

// ── Configuration ────────────────────────────────────────────────

export function setRateLimit(
  userId: string,
  config: Partial<RateLimitConfig>
): void {
  const us = getOrCreateUser(userId);
  Object.assign(us.rateLimit, config);
  log.info("llm_scheduler.rate_limit_updated", { userId, config });
}

export function setTokenBudget(userId: string, budget: number): void {
  const us = getOrCreateUser(userId);
  us.budget.budget = budget;
  us.budget.resetAt = now() + 60_000;
  log.info("llm_scheduler.budget_updated", { userId, budget });
}

export function setModelRoutes(routes: ModelRoute[]): void {
  state.routes = routes;
  log.info("llm_scheduler.routes_updated", { count: routes.length });
}

export function registerRateLimitProfile(
  name: string,
  config: RateLimitConfig
): void {
  DEFAULT_RATE_LIMITS[name] = config;
  log.info("llm_scheduler.profile_registered", { name, config });
}

// ── Scheduler Tick ───────────────────────────────────────────────

async function tick(): Promise<void> {
  if (state.processing) return;
  state.processing = true;

  try {
    drainTimedOut();

    const runnable = state.queue.filter((r) => r.status === "queued");
    for (const req of runnable) {
      const us = state.users.get(userIdKey(req.userId));
      if (!us) continue;

      const estimatedTokens = estimateTokens(req.prompt) + req.maxTokens;
      const rateCheck = checkRateLimit(us, estimatedTokens);
      if (!rateCheck.allowed) continue;

      req.status = "running";
      req.startedAt = now();
      us.running.add(req.agentId);
      us.bucket.requests.push(now());
      us.bucket.tokens.push(estimatedTokens);
      us.budget.used += estimatedTokens;
    }
  } finally {
    state.processing = false;
  }
}

export function startScheduler(intervalMs: number = 1000): void {
  if (state.tickTimer) return;
  state.tickTimer = setInterval(tick, intervalMs);
  log.info("llm_scheduler.started", { intervalMs });
}

export function stopScheduler(): void {
  if (state.tickTimer) {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }
  log.info("llm_scheduler.stopped");
}

// ── Reset (for testing) ──────────────────────────────────────────

export function resetScheduler(): void {
  stopScheduler();
  state.queue = [];
  state.users.clear();
  state.routes = [...DEFAULT_ROUTES];
  state.metrics = {
    processed: 0,
    failed: 0,
    timedOut: 0,
    totalLatencyMs: 0,
    latencySamples: [],
    tokensProcessed: 0,
    totalCost: 0,
  };
  state.costLog = [];
  state.processing = false;
}

// ── Cost Query ───────────────────────────────────────────────────

export function getCostLog(
  filter?: { userId?: string; agentId?: string; since?: number }
): CostRecord[] {
  let log = state.costLog;
  if (filter?.userId) {
    log = log.filter((r) => r.userId === filter.userId);
  }
  if (filter?.agentId) {
    log = log.filter((r) => r.agentId === filter.agentId);
  }
  if (filter?.since) {
    log = log.filter((r) => r.timestamp >= filter.since!);
  }
  return log;
}

export function getUserCost(userId: string, since?: number): {
  totalCost: number;
  requestCount: number;
  totalTokens: number;
} {
  const entries = state.costLog.filter(
    (r) => r.userId === userId && (!since || r.timestamp >= since)
  );
  return {
    totalCost: entries.reduce((s, r) => s + r.cost, 0),
    requestCount: entries.length,
    totalTokens: entries.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
  };
}

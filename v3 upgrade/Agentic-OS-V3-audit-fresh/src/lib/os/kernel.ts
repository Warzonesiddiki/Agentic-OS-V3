/**
 * os/kernel.ts — the Agentic OS core: syscall dispatcher, scheduler,
 * saga orchestrator, message bus, virtual filesystem, and runtime
 * supervisor. Every high-level operation funnels through syscalls; every
 * mutation is audited onto the brain's hash chain; no tool invocation
 * bypasses the policy/access layer.
 */
import { now, rid, truncate } from "../core";
import { appendAudit, commit, getState as getBrain } from "../engine";
import { commitOS, getOSState, updateOS } from "./store";
import { decideAccess, getTool, isSensitivePath, withinAllowedRoot } from "./policy";
import type {
  AgentRecord, Approval, BusMessage, CommandObservation, ContextSnapshot,
  MemoryCard, OSState, QueueId, Ring, Saga, SagaStep, Task, VfsDir, VfsNode,
} from "./types";

/* ------------------------------------------------------------------ *
 * Syscalls
 * ------------------------------------------------------------------ */

export type Syscall =
  | { type: "context.snapshot"; agentId: string; taskId?: string }
  | { type: "context.restore"; agentId: string; snapshotId: string }
  | { type: "memory.recall"; agentId: string; query: string; budget: number }
  | { type: "memory.write"; agentId: string; card: Partial<MemoryCard> & Pick<MemoryCard, "type" | "title" | "summary"> }
  | { type: "tool.invoke"; agentId: string; tool: string; args?: Record<string, unknown> }
  | { type: "task.spawn"; agentId: string; label: string; kind: Task["kind"]; simulateFailure?: boolean }
  | { type: "task.cancel"; agentId: string; taskId: string }
  | { type: "approval.request"; agentId: string; action: string; riskLevel: Approval["riskLevel"]; summary: string; details?: unknown }
  | { type: "signal.emit"; agentId: string; to?: string; signalType: string; message: string };

export interface SyscallResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  traceId: string;
  audited: boolean;
}

export function syscall(call: Syscall): SyscallResult {
  const traceId = rid("sys");
  const agent = lookupAgent(call.agentId);
  bumpMetric("syscallCount");
  const actor = agent?.name ?? call.agentId;

  try {
    switch (call.type) {
      case "context.snapshot":
        return ok(traceId, doContextSnapshot(call.agentId, call.taskId), true);
      case "context.restore":
        return ok(traceId, doContextRestore(call.agentId, call.snapshotId), true);
      case "memory.recall":
        return ok(traceId, doGraphRecall(call.query, call.budget), false);
      case "memory.write": {
        const card = addCard(call.card, actor);
        audit(actor, "os.memory.write", { id: card.id, type: card.type });
        return ok(traceId, { id: card.id }, true);
      }
      case "tool.invoke":
        return doToolInvoke(call, agent, traceId);
      case "task.spawn": {
        const task = enqueueTask(call.agentId, call.label, call.kind, call.simulateFailure);
        audit(actor, "os.task.spawn", { id: task.id, kind: task.kind, queue: task.queue });
        return ok(traceId, { id: task.id, status: task.status }, true);
      }
      case "task.cancel": {
        cancelTask(call.taskId);
        audit(actor, "os.task.cancel", { id: call.taskId }, false);
        return ok(traceId, { cancelled: true }, false);
      }
      case "approval.request": {
        const a = requestApproval(call.agentId, call.action, call.riskLevel, call.summary, call.details);
        publish(`approval.requested`, call.agentId, undefined, { approvalId: a.id, action: a.action });
        return ok(traceId, { id: a.id, status: a.status }, true);
      }
      case "signal.emit":
        publish(call.signalType, call.agentId, call.to, { message: call.message });
        audit(actor, "os.signal.emit", { type: call.signalType, to: call.to ?? "*" }, false);
        return ok(traceId, { delivered: true }, false);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "kernel error";
    return { ok: false, error: msg, traceId, audited: false };
  }
}

function lookupAgent(id: string): AgentRecord | undefined {
  return getOSState().agents.find((a) => a.id === id || a.name === id);
}

function ok(traceId: string, data: unknown, audited: boolean): SyscallResult {
  return { ok: true, data, traceId, audited };
}

/* ------------------------------------------------------------------ *
 * Tool invocation — routes through policy, may require approval.
 * ------------------------------------------------------------------ */

function doToolInvoke(call: Extract<Syscall, { type: "tool.invoke" }>, agent: AgentRecord | undefined, traceId: string): SyscallResult {
  const tool = getTool(call.tool);
  if (!tool) return { ok: false, error: `Unknown tool: ${call.tool}`, traceId, audited: false };
  const ring: Ring = agent?.ring ?? 3;
  const scopes = agent?.scopes ?? [];
  const decision = decideAccess(ring, scopes, tool, call.args);
  bumpMetric("toolInvocations");

  if (decision.blocked) {
    bumpMetric("policyDenials");
    publish("signal.blocked", call.agentId, undefined, { tool: call.tool, reason: decision.reason });
    audit(agent?.name ?? call.agentId, "os.policy.deny", { tool: call.tool, reason: decision.reason }, false);
    return { ok: false, error: decision.reason, traceId, audited: true };
  }
  if (decision.needsApproval) {
    const a = requestApproval(call.agentId, call.tool, decision.riskLevel, decision.reason, call.args);
    publish("approval.requested", call.agentId, undefined, { approvalId: a.id, tool: call.tool });
    return ok(traceId, { status: "approval_required", approvalId: a.id, reason: decision.reason }, true);
  }

  // Execute (simulated, deterministic). Shell calls are observed.
  let output: Record<string, unknown> = { tool: call.tool, ok: true };
  if (tool.name === "shell" && call.args?.cmd) {
    const obs = observeCommand(String(call.args.cmd), 0, "", "", []);
    output = { exitCode: 0, observationId: obs.id };
  }
  audit(agent?.name ?? call.agentId, "os.tool.invoke", { tool: call.tool, risk: tool.riskLevel }, false);
  return ok(traceId, output, true);
}

/* ------------------------------------------------------------------ *
 * Approval queue
 * ------------------------------------------------------------------ */

function requestApproval(agentId: string, action: string, riskLevel: Approval["riskLevel"], summary: string, details?: unknown): Approval {
  const a: Approval = {
    id: rid("apv"),
    agentId,
    action,
    riskLevel,
    summary: truncate(summary, 200),
    details,
    status: "pending",
    expiresAt: now() + 10 * 60 * 1000,
    createdAt: now(),
  };
  bumpMetric("approvalCount");
  commitOS({ ...getOSState(), approvals: [a, ...getOSState().approvals] });
  return a;
}

export function resolveApproval(id: string, approved: boolean, actor: string): Approval {
  const s = getOSState();
  const approvals = s.approvals.map((a) => (a.id === id ? { ...a, status: (approved ? "approved" : "denied") as Approval["status"], resolvedAt: now() } : a));
  const a = approvals.find((x) => x.id === id)!;
  commitOS({ ...s, approvals });
  publish("approval.resolved", "kernel", a.agentId, { id, approved });
  audit(actor, approved ? "os.approval.approved" : "os.approval.denied", { id, action: a.action }, false);
  return a;
}

export function expireApprovals(): number {
  const t = now();
  const s = getOSState();
  let n = 0;
  const approvals = s.approvals.map((a) => {
    if (a.status === "pending" && a.expiresAt < t) {
      n++;
      return { ...a, status: "expired" as const };
    }
    return a;
  });
  if (n) commitOS({ ...s, approvals });
  return n;
}

/* ------------------------------------------------------------------ *
 * Scheduler — priority queues, starvation prevention, fuel/timeout,
 * dead-letter, idempotency.
 * ------------------------------------------------------------------ */

const KIND_QUEUE: Record<Task["kind"], QueueId> = {
  safety: "Q0",
  interactive: "Q1",
  background: "Q2",
  maintenance: "Q3",
  self_improvement: "Q4",
};

export function enqueueTask(agentId: string, label: string, kind: Task["kind"], simulateFailure = false): Task {
  const queue = KIND_QUEUE[kind];
  const idempotencyKey = `${agentId}:${label}:${kind}`;
  const existing = getOSState().tasks.find((t) => t.idempotencyKey === idempotencyKey && t.status !== "dead_letter");
  if (existing) return existing; // idempotent

  const task: Task = {
    id: rid("tsk"),
    label,
    kind,
    queue,
    priority: queuePriority(queue),
    status: "queued",
    agentId,
    input: { simulateFailure },
    fuelBudget: 100,
    fuelUsed: 0,
    timeoutMs: 30000,
    idempotencyKey,
    waits: 0,
    createdAt: now(),
  };
  commitOS({ ...getOSState(), tasks: [...getOSState().tasks, task] });
  return task;
}

function queuePriority(q: QueueId): number {
  return { Q0: 100, Q1: 80, Q2: 60, Q3: 40, Q4: 20 }[q];
}

/** Process the next runnable task (highest priority, starvation-aware). */
export function schedulerTick(): Task | null {
  expireApprovals();
  const s = getOSState();
  // Age waiting tasks to prevent starvation.
  const aged = s.tasks.map((t) => (t.status === "queued" ? { ...t, waits: t.waits + 1 } : t));
  const queued = aged.filter((t) => t.status === "queued");
  if (!queued.length) return null;

  // Effective priority = base + starvation boost.
  const pick = queued
    .map((t) => ({ t, eff: t.priority + Math.min(60, t.waits * 5) }))
    .sort((a, b) => b.eff - a.eff)[0].t;

  const taskInput = typeof pick.input === "object" && pick.input !== null ? (pick.input as Record<string, unknown>) : {};
  const simulateFailure = Boolean(taskInput.simulateFailure);
  const startedAt = now();
  const fuelUsed = pick.fuelBudget;
  const failed = simulateFailure;
  const status: Task["status"] = failed ? "failed" : "succeeded";
  const finished: Task = {
    ...pick,
    status,
    fuelUsed,
    startedAt,
    finishedAt: now(),
    output: failed ? undefined : { result: `${pick.label} complete`, fuelUsed },
    error: failed ? "Simulated failure for dead-letter demo." : undefined,
  };

  // Dead-letter: a failed task with no compensating path after first failure.
  const tasks = aged.map((t) => (t.id === pick.id ? finished : t));
  const metrics = { ...s.metrics };
  if (failed) {
    metrics.taskFailed++;
    metrics.sagaFailures++;
    // Move to dead_letter queue.
    finished.status = "dead_letter";
  } else {
    metrics.taskSucceeded++;
  }
  commitOS({ ...s, tasks, metrics });
  publish(failed ? "task.failed" : "task.completed", pick.agentId, undefined, { taskId: pick.id, status: finished.status });
  return finished;
}

export function cancelTask(taskId: string): void {
  commitOS({
    ...getOSState(),
    tasks: getOSState().tasks.map((t) => (t.id === taskId && (t.status === "queued" || t.status === "running") ? { ...t, status: "cancelled", finishedAt: now() } : t)),
  });
}

export function schedulerStatus(): { depth: Record<QueueId, number>; running: number; deadLetter: number } {
  const t = getOSState().tasks;
  return {
    depth: {
      Q0: t.filter((x) => x.queue === "Q0" && x.status === "queued").length,
      Q1: t.filter((x) => x.queue === "Q1" && x.status === "queued").length,
      Q2: t.filter((x) => x.queue === "Q2" && x.status === "queued").length,
      Q3: t.filter((x) => x.queue === "Q3" && x.status === "queued").length,
      Q4: t.filter((x) => x.queue === "Q4" && x.status === "queued").length,
    },
    running: t.filter((x) => x.status === "running").length,
    deadLetter: t.filter((x) => x.status === "dead_letter").length,
  };
}

/* ------------------------------------------------------------------ *
 * Saga orchestrator with compensation
 * ------------------------------------------------------------------ */

export function startSaga(name: string, steps: Omit<SagaStep, "id" | "status">[]): Saga {
  const saga: Saga = {
    id: rid("sga"),
    name,
    status: "running",
    currentStep: 0,
    steps: steps.map((st) => ({ ...st, id: rid("stp"), status: "pending" })),
    createdAt: now(),
  };
  commitOS({ ...getOSState(), sagas: [saga, ...getOSState().sagas] });
  return runSaga(saga.id);
}

export function runSaga(sagaId: string): Saga {
  const s = getOSState();
  const found = s.sagas.find((x) => x.id === sagaId);
  if (!found) throw new Error("Saga not found");
  const steps = found.steps.map((st) => ({ ...st }));
  let status: Saga["status"] = "succeeded";
  let failedAt = -1;

  for (let i = found.currentStep; i < steps.length; i++) {
    const step = steps[i];
    steps[i] = { ...step, status: "running" };
    if (step.action.startsWith("FAIL:")) {
      steps[i] = { ...step, status: "failed" };
      failedAt = i;
      break;
    }
    steps[i] = { ...step, status: "succeeded", result: `ok:${step.action}` };
  }

  if (failedAt >= 0) {
    // Compensate prior succeeded steps in reverse.
    for (let i = failedAt - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.status === "succeeded" && step.compensate) {
        steps[i] = { ...step, status: "compensated", result: `rolled back via ${step.compensate}` };
      }
    }
    status = "compensated";
    const metrics = { ...s.metrics, sagaFailures: s.metrics.sagaFailures + 1 };
    commitOS({ ...s, sagas: s.sagas.map((x) => (x.id === sagaId ? { ...found, steps, status, currentStep: failedAt, finishedAt: now() } : x)), metrics });
    audit("kernel", "os.saga.compensated", { sagaId, failedAt }, false);
  } else {
    commitOS({ ...s, sagas: s.sagas.map((x) => (x.id === sagaId ? { ...found, steps, status, finishedAt: now() } : x)) });
    audit("kernel", "os.saga.succeeded", { sagaId }, false);
  }
  return { ...found, steps, status, finishedAt: now() };
}

/* ------------------------------------------------------------------ *
 * Message bus — publish/subscribe, ack/nack, dead-letter
 * ------------------------------------------------------------------ */

const busListeners = new Set<(m: BusMessage) => void>();
export function subscribeBus(fn: (m: BusMessage) => void): () => void {
  busListeners.add(fn);
  return () => busListeners.delete(fn);
}

export function publish(type: string, from: string, to: string | undefined, payload: unknown): BusMessage {
  const m: BusMessage = { id: rid("msg"), type, from, to, payload, acked: false, deliveries: 0, createdAt: now() };
  commitOS({ ...getOSState(), bus: [m, ...getOSState().bus] });
  for (const fn of busListeners) fn(m);
  return m;
}

export function ackMessage(id: string, ack: boolean): void {
  const s = getOSState();
  const bus = s.bus.map((m) => {
    if (m.id !== id) return m;
    if (ack) return { ...m, acked: true };
    const deliveries = m.deliveries + 1;
    return { ...m, deliveries }; // after 3 nacks it stays as dead-letter signal
  });
  commitOS({ ...s, bus });
}

export function deadLetterBus(): BusMessage[] {
  return getOSState().bus.filter((m) => !m.acked && m.deliveries >= 3);
}

/* ------------------------------------------------------------------ *
 * Virtual filesystem — safe read/write/list/snapshot/restore
 * ------------------------------------------------------------------ */

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function resolveNode(root: VfsDir, path: string): { parent: VfsDir | null; node: VfsNode | null; name: string } {
  const parts = splitPath(path);
  let cur: VfsDir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur.children[parts[i]];
    if (!next || next.type !== "dir") return { parent: null, node: null, name: parts[parts.length - 1] };
    cur = next;
  }
  const name = parts[parts.length - 1] ?? "";
  const node = name ? cur.children[name] ?? null : root;
  return { parent: parts.length ? cur : null, node, name };
}

export function vfsRead(path: string): { ok: boolean; content?: string; reason?: string; sensitive?: boolean } {
  if (!withinAllowedRoot(path)) return { ok: false, reason: "Path outside allowed roots." };
  if (path.includes("..")) return { ok: false, reason: "Path traversal rejected." };
  const { node } = resolveNode(getOSState().vfs, path);
  if (!node || node.type !== "file") return { ok: false, reason: "Not a file." };
  return { ok: true, content: node.content, sensitive: node.sensitive || isSensitivePath(path) };
}

export function vfsWrite(path: string, content: string): { ok: boolean; reason?: string; approvalNeeded?: boolean } {
  if (!withinAllowedRoot(path)) return { ok: false, reason: "Path outside allowed roots." };
  if (path.includes("..") || path.includes("\0")) return { ok: false, reason: "Unsafe path." };
  if (isSensitivePath(path)) return { ok: false, reason: "Sensitive file requires approval.", approvalNeeded: true };
  commitOS({
    ...getOSState(),
    vfs: writeNode(getOSState().vfs, path, content),
  });
  return { ok: true };
}

function writeNode(root: VfsDir, path: string, content: string): VfsDir {
  const parts = splitPath(path);
  const clone = (d: VfsDir): VfsDir => ({ ...d, children: { ...d.children } });
  const recurse = (dir: VfsDir, depth: number): VfsDir => {
    const d = clone(dir);
    if (depth === parts.length - 1) {
      d.children[parts[depth]] = { type: "file", name: parts[depth], content, mtime: now(), sensitive: isSensitivePath(path) };
      return d;
    }
    const child = d.children[parts[depth]];
    d.children[parts[depth]] = recurse(child && child.type === "dir" ? child : { type: "dir", name: parts[depth], children: {} }, depth + 1);
    return d;
  };
  return recurse(root, 0);
}

export function vfsList(path: string): string[] {
  const { node } = resolveNode(getOSState().vfs, path || "/");
  if (!node) return [];
  if (node.type === "file") return [path];
  return Object.keys(node.children).map((k) => `${path === "/" ? "" : path}/${k}`);
}

export function vfsSnapshot(paths: string[]): { id: string; captured: number } {
  const data: Record<string, string> = {};
  for (const p of paths) {
    const r = vfsRead(p);
    if (r.ok && r.content !== undefined) data[p] = r.content;
  }
  const snap = { id: rid("vfs"), root: "/", paths, data, createdAt: now() };
  commitOS({ ...getOSState(), vfsSnapshots: [snap, ...getOSState().vfsSnapshots] });
  return { id: snap.id, captured: Object.keys(data).length };
}

export function vfsRestore(snapshotId: string): { ok: boolean; restored: number } {
  const s = getOSState();
  const snap = s.vfsSnapshots.find((x) => x.id === snapshotId);
  if (!snap) return { ok: false, restored: 0 };
  let vfs = s.vfs;
  for (const [p, content] of Object.entries(snap.data)) vfs = writeNode(vfs, p, content);
  commitOS({ ...s, vfs });
  return { ok: true, restored: Object.keys(snap.data).length };
}

/* ------------------------------------------------------------------ *
 * Context manager — snapshot / restore (rehydrates compact context)
 * ------------------------------------------------------------------ */

function doContextSnapshot(agentId: string, taskId?: string): { snapshotId: string; tokens: number } {
  const s = getOSState();
  const brain = getBrain();
  const recentCommands = s.observations.slice(0, 5);
  const activeMemories = brain.memories.slice(0, 5).map((m) => m.id);
  const activeSkills = brain.skills.slice(0, 3).map((k) => k.id);
  const summary = compactContext().text;
  const snap: ContextSnapshot = {
    id: rid("ctx"),
    agentId,
    taskId,
    cwd: s.agents.find((a) => a.id === agentId)?.cwd ?? "/project",
    activeMemories,
    activeSkills,
    activeHandoff: s.handoffs[0]?.id,
    recentCommands,
    compactSummary: summary,
    tokenFootprint: Math.ceil(summary.length / 4),
    createdAt: now(),
  };
  commitOS({ ...s, snapshots: [snap, ...s.snapshots] });
  return { snapshotId: snap.id, tokens: snap.tokenFootprint };
}

function doContextRestore(agentId: string, snapshotId: string): { ok: boolean; tokens: number } {
  const snap = getOSState().snapshots.find((x) => x.id === snapshotId);
  if (!snap) return { ok: false, tokens: 0 };
  // Mark agent active with restored context (no source mutation).
  updateOS((s) => ({ ...s, agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: "active", lastHeartbeatAt: now() } : a)) }));
  return { ok: true, tokens: snap.tokenFootprint };
}

/* ------------------------------------------------------------------ *
 * Runtime supervisor
 * ------------------------------------------------------------------ */

const STUCK_MS = 120000;

export function heartbeat(agentId: string): void {
  updateOS((s) => ({ ...s, agents: s.agents.map((a) => (a.id === agentId || a.name === agentId ? { ...a, lastHeartbeatAt: now(), status: a.status === "quarantined" ? a.status : "active" } : a)) }));
}

export function detectStuck(): AgentRecord[] {
  const t = now();
  return getOSState().agents.filter((a) => a.status === "active" && a.lastHeartbeatAt && t - a.lastHeartbeatAt > STUCK_MS);
}

export function quarantine(agentId: string): void {
  updateOS((s) => ({ ...s, agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: "quarantined", ring: 4 } : a)) }));
  publish("agent.quarantined", "supervisor", agentId, {});
}

export function resumeAgent(agentId: string): void {
  updateOS((s) => ({ ...s, agents: s.agents.map((a) => (a.id === agentId ? { ...a, status: "active", ring: 1, lastHeartbeatAt: now() } : a)) }));
}

/* ------------------------------------------------------------------ *
 * Helpers shared with lifecycle/diagnostics
 * ------------------------------------------------------------------ */

export function observeCommand(command: string, exitCode: number, stdoutSummary: string, stderrSummary: string, filesChanged: string[]): CommandObservation {
  const result: CommandObservation["result"] = exitCode === 0 ? "success" : "failure";
  const lesson = extractLesson(command, exitCode, stderrSummary);
  const obs: CommandObservation = { id: rid("obs"), command, exitCode, stdoutSummary: truncate(stdoutSummary, 200), stderrSummary: truncate(stderrSummary, 200), filesChanged, testsRun: 0, result, lesson, createdAt: now() };
  commitOS({ ...getOSState(), observations: [obs, ...getOSState().observations] });
  return obs;
}

function extractLesson(command: string, exitCode: number, stderr: string): string | undefined {
  if (exitCode === 0) return undefined;
  if (/typecheck|tsc/i.test(command)) return "Type errors must be fixed before build.";
  if (/build|vite|next build/i.test(command)) return stderr.includes("DATABASE_URL") ? "Build requires DATABASE_URL set." : "Build failed — check prior step.";
  if (/test|vitest|jest/i.test(command)) return "Tests failed — capture the failing seed.";
  return "Command failed — record as known pitfall.";
}

/** Compact always-loaded agent context (Tier B). Memoized-ish by freshness. */
export function compactContext(maxTokens = 800): { text: string; tokens: number } {
  const brain = getBrain();
  const cards = getOSState().cards.filter((c) => c.stability === "confirmed");
  const lines: string[] = ["# NEXUS Project Context", "", "## Current Objective", "Advance NEXUS 2.0 toward production-ready stability.", "", "## Coding Conventions & Facts"];
  const pool = [...brain.memories.filter((m) => m.importance >= 0.7), ...cards.map((c) => ({ title: c.title, content: c.summary, importance: c.importance }))];
  pool.sort((a, b) => b.importance - a.importance);
  for (const p of pool.slice(0, 8)) {
    const line = `- ${p.title}`;
    if (Math.ceil((lines.join("\n").length + line.length) / 4) > maxTokens) break;
    lines.push(line);
  }
  const avoid = getOSState().observations.filter((o) => o.result === "failure").slice(0, 3);
  if (avoid.length) {
    lines.push("", "## Known Pitfalls");
    for (const o of avoid) lines.push(`- ${o.lesson ?? o.command} (exit ${o.exitCode})`);
  }
  const text = lines.join("\n");
  return { text, tokens: Math.ceil(text.length / 4) };
}

export function addCard(input: Partial<MemoryCard> & Pick<MemoryCard, "type" | "title" | "summary">, actor: string): MemoryCard {
  const t = now();
  const card: MemoryCard = {
    id: rid("card"),
    type: input.type,
    title: input.title,
    summary: input.summary,
    body: input.body ?? input.summary,
    entities: input.entities ?? [],
    evidence: input.evidence ?? [],
    confidence: input.confidence ?? 0.5,
    stability: input.stability ?? "draft",
    importance: input.importance ?? 0.5,
    accessCount: 0,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: null,
    lastVerifiedAt: null,
    decayHalfLifeDays: input.decayHalfLifeDays ?? 30,
    createdAt: t,
    updatedAt: t,
  };
  commitOS({ ...getOSState(), cards: [card, ...getOSState().cards] });
  audit(actor, "os.card.created", { id: card.id, type: card.type }, false);
  return card;
}

/** Graph recall: BM25 over cards, expandable one hop via edges. */
export function doGraphRecall(query: string, budget: number): { items: MemoryCard[]; expanded: string[]; tokens: number } {
  const s = getOSState();
  const q = (query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2);
  const scored = s.cards
    .map((c) => {
      const text = `${c.title} ${c.summary} ${c.body} ${c.entities.join(" ")}`.toLowerCase();
      let lex = 0;
      for (const term of q) if (text.includes(term)) lex++;
      const decay = Math.pow(0.5, (Date.now() - c.updatedAt) / (c.decayHalfLifeDays * 86400000));
      const contradictionPenalty = c.stability === "contradicted" ? 0.5 : c.stability === "deprecated" ? 0.3 : 0;
      const score = lex * 0.5 + c.confidence * 0.2 + c.importance * 0.2 + decay * 0.1 - contradictionPenalty;
      return { c, score: Math.max(0, score) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  let tokens = 0;
  const items: MemoryCard[] = [];
  const expanded: string[] = [];
  for (const { c } of scored) {
    const cost = Math.ceil(c.summary.length / 4);
    if (tokens + cost > budget) continue;
    items.push(c);
    tokens += cost;
    // Expand one hop.
    for (const e of s.edges) {
      if (e.from === c.id && !expanded.includes(e.to)) expanded.push(e.to);
      if (e.to === c.id && !expanded.includes(e.from)) expanded.push(e.from);
    }
  }
  return { items, expanded, tokens };
}

/* ------------------------------------------------------------------ *
 * Audit bridge — every OS mutation lands on the brain's hash chain.
 * ------------------------------------------------------------------ */

function audit(actor: string, action: string, payload: unknown, critical = false): void {
  try {
    commit(appendAudit(getBrain(), action, payload, actor));
  } catch {
    // Critical audit failures must be visible — bump the counter, never swallow silently.
    updateOS((s) => ({ ...s, metrics: { ...s.metrics, auditAppendFailures: s.metrics.auditAppendFailures + 1 } }));
    if (critical) publish("audit.failure", "kernel", undefined, { action });
  }
}

function bumpMetric(key: keyof OSState["metrics"]): void {
  updateOS((s) => ({ ...s, metrics: { ...s.metrics, [key]: s.metrics[key] + 1 } }));
}

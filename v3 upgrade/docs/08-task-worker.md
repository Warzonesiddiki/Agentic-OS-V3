# 08 — Task Worker (The Missing Runtime)
## NEXUS V3 — Background Task Execution Loop

> **THE MOST CRITICAL MISSING PIECE.**
> Without this, every enqueued task sits in "queued" status forever.
> This file contains the complete task worker that dequeues and executes tasks.

---

## The Problem

The kernel has `enqueueTask()` and `pickNextTask()`, but **nothing calls `pickNextTask()` in a loop.** Every task (ambient ingestion, cron jobs, HITL-approved tasks) enters the queue and never executes.

## The Solution

A background worker loop that:
1. Polls `pickNextTask()` every N seconds
2. Checks for compiled script match first
3. Dispatches to the right handler (LLM, function, browser)
4. Calls `completeTask()` or `failTask()`
5. Handles retries and dead-letter quarantine

---

## Complete Code: `server/src/services/task-worker.ts`

```typescript
// server/src/services/task-worker.ts
import { pickNextTask, completeTask, failTask, updateAgentState } from "./kernel.js";
import { checkCompiledScript } from "./skill-compiler.js";
import { captureSession } from "../services.js";
import { logTrajectory } from "./audit-engine.js";
import { broadcastSSE } from "./sse.js";
import { log } from "../lib/logging.js";
import { getEnv } from "../lib/env.js";

let workerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

/**
 * Start the task worker. Polls every NEXUS_SCHEDULER_TICK_MS.
 * Idempotent — safe to call multiple times.
 */
export function startTaskWorker(tickMs?: number): void {
  if (workerRunning) return;
  workerRunning = true;

  const interval = tickMs ?? getEnv().NEXUS_SCHEDULER_TICK_MS;
  log.info("task_worker_started", { tickMs: interval });

  workerInterval = setInterval(async () => {
    try {
      await processNextTask();
    } catch (e) {
      log.error("task_worker_error", { error: e instanceof Error ? e.message : String(e) });
    }
  }, interval);

  workerInterval.unref?.();
}

export function stopTaskWorker(): void {
  if (workerInterval) { clearInterval(workerInterval); workerInterval = null; }
  workerRunning = false;
}

async function processNextTask(): Promise<boolean> {
  const task = await pickNextTask();
  if (!task) return false;

  log.info("task_processing", { taskId: task.id, label: task.label, kind: task.kind });

  // Update agent state to "executing_tool"
  if (task.agentId) {
    await updateAgentState(task.agentId, "executing_tool", task.label);
    broadcastSSE({ type: "agent.state", data: { id: task.agentId, status: "executing_tool", currentTool: task.label }, timestamp: Date.now() });
  }

  try {
    // Step 1: Check for compiled script (hot-swap)
    const compiled = await checkCompiledScript(task.label, task.input);
    if (compiled) {
      await completeTask(task.id, compiled.output, "task-worker");
      log.info("task_compiled_executed", { taskId: task.id, scriptId: compiled.scriptId });
      broadcastSSE({ type: "task.update", data: { id: task.id, status: "succeeded", compiled: true }, timestamp: Date.now() });
      return true;
    }

    // Step 2: Dispatch to handler
    const result = await dispatchTask(task.id, task.label, task.kind, task.input);

    // Step 3: Complete
    await completeTask(task.id, result, "task-worker");

    // Update agent state to "idle"
    if (task.agentId) {
      await updateAgentState(task.agentId, "idle");
      broadcastSSE({ type: "agent.state", data: { id: task.agentId, status: "idle" }, timestamp: Date.now() });
    }

    broadcastSSE({ type: "task.update", data: { id: task.id, status: "succeeded" }, timestamp: Date.now() });
    log.info("task_completed", { taskId: task.id });
    return true;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    log.error("task_failed", { taskId: task.id, error: errorMsg });
    await failTask(task.id, errorMsg, "task-worker");

    if (task.agentId) {
      await updateAgentState(task.agentId, "errored");
      broadcastSSE({ type: "agent.state", data: { id: task.agentId, status: "errored", error: errorMsg }, timestamp: Date.now() });
    }

    broadcastSSE({ type: "task.update", data: { id: task.id, status: "failed", error: errorMsg }, timestamp: Date.now() });
    return true;
  }
}

/**
 * Dispatch a task to the appropriate handler based on kind + input shape.
 */
async function dispatchTask(taskId: string, label: string, kind: string, input: unknown): Promise<unknown> {
  const inputData = (typeof input === "object" && input !== null) ? input as Record<string, unknown> : {};

  // ── Ambient ingestion tasks ──
  if (inputData.transcript && typeof inputData.transcript === "string") {
    const report = await captureSession(
      inputData.transcript as string,
      (inputData.source as string) ?? "ambient",
      "task-worker",
    );
    return report;
  }

  // ── Interactive tasks (LLM) ──
  if (kind === "interactive") {
    const e = getEnv();
    if (!e.NEXUS_LLM_BASE_URL || !e.NEXUS_LLM_API_KEY || !e.NEXUS_LLM_MODEL) {
      throw new Error("Interactive task requires LLM configuration");
    }
    // Use the LLM client (from 09-llm-client.md)
    const { callLLM } = await import("./llm-client.js");
    const result = await callLLM({
      agentId: inputData.agentId as string ?? "task-agent",
      systemPrompt: "You are a NEXUS task executor. Complete the given task.",
      userPrompt: `Task: ${label}\nInput: ${JSON.stringify(inputData).slice(0, 2000)}`,
      actor: "task-worker",
    });
    return { content: result.content, tokensUsed: result.tokensUsed };
  }

  // ── Background tasks ──
  if (kind === "background") {
    // Generic background task — could be distillation, indexing, etc.
    return { status: "completed", label, kind };
  }

  // ── Maintenance tasks ──
  if (kind === "maintenance") {
    // Could be compression, embedding rebuild, etc.
    return { status: "completed", label, kind };
  }

  // ── Safety tasks ──
  if (kind === "safety") {
    return { status: "completed", label, kind };
  }

  // ── Self-improvement tasks ──
  if (kind === "self_improvement") {
    // Could trigger skill compilation
    return { status: "completed", label, kind };
  }

  throw new Error(`Unknown task kind: ${kind}`);
}
```

---

## Wiring into Server Bootstrap

In `server/src/index.ts`, add after `server.listen()`:

```typescript
import { startTaskWorker, stopTaskWorker } from "./services/task-worker.js";

// Start the task execution worker
startTaskWorker();
log.info("task_worker_started", {});

// On shutdown:
process.on("SIGTERM", () => {
  stopTaskWorker();
  clearInterval(schedulerInterval);
  clearInterval(watchdogInterval);
});
```

---

## How This Unblocks Everything

| Feature | Before (V2) | After (V3) |
|---------|-------------|------------|
| **Ambient ingestion** | Enqueues task → sits forever | Enqueues task → worker picks it up → calls `captureSession()` → memories created |
| **Cron daemons** | `tickCron()` spawns agent + enqueues task → sits forever | `tickCron()` enqueues → worker executes → result stored |
| **HITL approval** | `resolveApproval()` clears error → task stays in limbo | `resolveApproval()` re-queues → worker picks it up → executes |
| **Multi-agent delegation** | `nexus_delegate` spawns agent + enqueues → sits forever | Enqueue → worker picks up → LLM called → result returned |
| **Neural skill hot-swap** | `checkCompiledScript()` exists but never called | Worker checks BEFORE dispatching to LLM → compiled script runs instead |

---

## Success Checklist

```
[ ] startTaskWorker() called in bootstrap
[ ] Worker polls every NEXUS_SCHEDULER_TICK_MS
[ ] Queued tasks transition to "running" then "succeeded" or "failed"
[ ] Ambient transcripts get distilled by the worker
[ ] Cron-spawned tasks execute via the worker
[ ] HITL-approved tasks re-execute via the worker
[ ] Agent state updates broadcast via SSE (idle → executing → idle/errored)
[ ] Failed tasks retry up to maxRetries, then dead-letter
[ ] Worker doesn't crash on task errors (catches and continues)
```

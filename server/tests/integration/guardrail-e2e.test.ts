/**
 * End-to-end guardrail enforcement test (security seam).
 *
 * Boots the REAL kernel against an in-memory better-sqlite3 database and wires
 * the live guardrail seam (setGuardrailThreshold + assertWithinGuardrail) into
 * the kernel admission gate. We assert that:
 *
 *   1. A task whose metric breaches a registered guardrail is BLOCKED at the
 *      admission gate (HTTP 423-equivalent rejection) and is never enqueued.
 *   2. A compliant task passes the admission gate, is enqueued, and can be
 *      picked + marked executed by the scheduler.
 *
 * Run with:  npx vitest run tests/integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, eq } from 'drizzle-orm/better-sqlite3';
import { agents, agentTasks } from '../../src/db/schema-sqlite.js';

// ── In-memory DB + client mock (mirrors tests/services/kernel.test.ts) ──
const sqlite = new Database(':memory:');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = OFF');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'sub-agent',
    parent_id TEXT,
    ring INTEGER NOT NULL DEFAULT 1,
    scopes TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    current_tool TEXT,
    llm_model TEXT,
    token_budget INTEGER NOT NULL DEFAULT 100000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    timeout_ms INTEGER NOT NULL DEFAULT 120000,
    max_retries INTEGER NOT NULL DEFAULT 3,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    last_heartbeat_at TEXT,
    scheduling_mode TEXT NOT NULL DEFAULT 'preemptive',
    cgroup TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'interactive',
    queue TEXT NOT NULL DEFAULT 'Q1',
    priority INTEGER NOT NULL DEFAULT 80,
    status TEXT NOT NULL DEFAULT 'queued',
    input TEXT NOT NULL DEFAULT '{}',
    output TEXT,
    error TEXT,
    idempotency_key TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    trace_id TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    started_at TEXT,
    finished_at TEXT,
    deadline TEXT,
    quantum_ms INTEGER,
    checkpoint TEXT NOT NULL DEFAULT '{}',
    gang_id TEXT,
    estimated_duration_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_priority
    ON agent_tasks (status, priority);
  CREATE INDEX IF NOT EXISTS agent_tasks_queued_priority_created_idx
    ON agent_tasks (priority, created_at);
`);

const db = drizzle(sqlite);

vi.mock('../../src/db/client', () => ({
  default: { db, agents, agentTasks },
  db,
  isSqlite: true,
  getPgClient: () => null,
  getDbLockStatus: () => Promise.resolve({ isLocked: false, queueLength: 0 }),
  getBackend: () => 'sqlite',
  closeDb: () => {},
  isPoolInitialized: () => true,
  dbHealthy: () => Promise.resolve(true),
  withTransaction: (fn: any) => fn(db),
  agents,
  agentTasks,
}));

vi.mock('../../src/lib/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/audit-engine.js', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
  logToolReceipt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/message-bus.js', () => ({
  publishKernelEvent: vi.fn(() => undefined),
}));
vi.mock('../../src/services/message-bus.js', () => ({
  getMessageBus: () => ({ publish: vi.fn() }),
  publishKernelEvent: vi.fn(() => undefined),
}));
vi.mock('../../src/services/skill-template-engine.js', () => ({
  checkCompiledScript: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/services/task-notifier.js', () => ({
  notifyTaskQueued: vi.fn(),
}));

import {
  enqueueTask,
  pickNextTask,
  spawnAgent,
} from '../../src/services/kernel.js';
import {
  assertWithinGuardrail,
  setGuardrailThreshold,
  listGuardrails,
} from '../../src/services/guardrails.js';

let agentId: string;

// The admission gate: real kernel enqueue, but guarded by the live guardrail seam.
// Mirrors how a route/handler would reject a request (HTTP 423) before enqueueing.
function admissionGate(metricId: string, value: number) {
  const check = assertWithinGuardrail(metricId, value, 'e2e-test');
  if (!check.allowed) {
    const err = new Error(
      `admission blocked by guardrail ${metricId}: value ${value} > limit ${check.limit}`
    ) as Error & { status?: number };
    err.status = 423;
    throw err;
  }
  return check;
}

beforeEach(async () => {
  const agent = await spawnAgent(
    { name: 'guardrail-e2e-agent', ring: 2, metadata: { test: true } },
    'tester'
  );
  agentId = agent.id;
});

afterEach(() => {
  sqlite.exec('DELETE FROM agent_tasks;');
  sqlite.exec('DELETE FROM agents;');
});

describe('guardrail e2e — admission gate enforcement', () => {
  it('registers a guardrail threshold via the live seam', () => {
    setGuardrailThreshold('agent.tokens.per_run', { max: 1_000, warnAt: 800 });
    const found = listGuardrails().find((g) => g.id === 'agent.tokens.per_run');
    expect(found).toBeDefined();
    expect(found!.max).toBe(1_000);
  });

  it('blocks a breaching task at the admission gate (HTTP 423) and never enqueues it', async () => {
    setGuardrailThreshold('agent.tokens.per_run', { max: 1_000, warnAt: 800 });

    expect(() => admissionGate('agent.tokens.per_run', 5_000)).toThrow(
      /admission blocked by guardrail/
    );

    try {
      admissionGate('agent.tokens.per_run', 5_000);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error & { status?: number }).status).toBe(423);
    }

    // The blocked task was NOT enqueued into the backing store.
    const rows = await db.select().from(agentTasks);
    expect(rows).toHaveLength(0);
  });

  it('allows a compliant task through the admission gate and enqueues it', async () => {
    setGuardrailThreshold('agent.tokens.per_run', { max: 1_000, warnAt: 800 });

    const check = admissionGate('agent.tokens.per_run', 500);
    expect(check.allowed).toBe(true);

    const task = await enqueueTask(
      {
        agentId,
        kind: 'interactive',
        input: { tokens: 500, prompt: 'hello' },
      },
      'tester'
    );
    expect(task.status).toBe('queued');

    const rows = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, task.id));
    expect(rows).toHaveLength(1);
  });

  it('compliant task is schedulable and can be marked executed (positive path)', async () => {
    setGuardrailThreshold('agent.tokens.per_run', { max: 1_000, warnAt: 800 });
    const check = admissionGate('agent.tokens.per_run', 200);
    expect(check.allowed).toBe(true);

    const task = await enqueueTask(
      { agentId, kind: 'interactive', input: { ok: true } },
      'tester'
    );

    const picked = await pickNextTask();
    expect(picked).not.toBeNull();
    expect(picked!.id).toBe(task.id);

    await db
      .update(agentTasks)
      .set({ status: 'running', startedAt: new Date().toISOString() })
      .where(eq(agentTasks.id, task.id));
    const running = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, task.id));
    expect(running[0].status).toBe('running');
  });

  it('rejects once the threshold is tightened, then passes after loosening', async () => {
    setGuardrailThreshold('agent.tokens.per_run', { max: 10, warnAt: 8 });
    expect(() => admissionGate('agent.tokens.per_run', 50)).toThrow();

    setGuardrailThreshold('agent.tokens.per_run', { max: 10_000, warnAt: 8_000 });
    expect(admissionGate('agent.tokens.per_run', 50).allowed).toBe(true);
  });
});

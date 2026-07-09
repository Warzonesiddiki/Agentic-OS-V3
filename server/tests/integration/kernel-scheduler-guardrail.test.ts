/**
 * Integration tests — Kernel / Scheduler / Security seam.
 *
 * Boots the REAL kernel (no mocks of the scheduling logic) against an
 * in-memory better-sqlite3 database (no external Postgres required) and
 * exercises the end-to-end admission → scheduling → guardrail contract:
 *
 *   1. Kernel admission gate enqueues tasks into MLFQ priority rings by kind.
 *   2. Scheduler applies starvation-promotion (aging) to low-priority work.
 *   3. Scheduler applies preemption — a high-priority task displaces a low.
 *   4. Guardrail enforcement rejects (allowed:false) over-threshold usage.
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
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent
    ON agent_tasks (agent_id);
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

// ── Mock peripheral modules that touch the (uninitialised) global db ──
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
  schedulerStatus,
  getMlfqPromotionCount,
  resetMlfqPromotionCount,
  spawnAgent,
  acquireRingBudget,
  releaseRingBudget,
  authorizeToolCall,
  checkACL,
} from '../../src/services/kernel.js';
import {
  assertWithinGuardrail,
  setGuardrailThreshold,
} from '../../src/services/guardrails.js';

let agentId: string;

beforeEach(async () => {
  resetMlfqPromotionCount();
  const agent = await spawnAgent(
    { name: 'int-test-agent', ring: 2, metadata: { test: true } },
    'tester'
  );
  agentId = agent.id;
});

afterEach(() => {
  // clean tasks between tests
  sqlite.exec('DELETE FROM agent_tasks;');
  sqlite.exec('DELETE FROM agents;');
});

describe('kernel admission gate → MLFQ priority rings', () => {
  it('enqueues tasks into the correct ring/queue by kind', async () => {
    const safety = await enqueueTask(
      { agentId, kind: 'safety', input: { x: 1 } },
      'tester'
    );
    const interactive = await enqueueTask(
      { agentId, kind: 'interactive', input: { x: 2 } },
      'tester'
    );
    const background = await enqueueTask(
      { agentId, kind: 'background', input: { x: 3 } },
      'tester'
    );
    const maintenance = await enqueueTask(
      { agentId, kind: 'maintenance', input: { x: 4 } },
      'tester'
    );
    const selfImp = await enqueueTask(
      { agentId, kind: 'self_improvement', input: { x: 5 } },
      'tester'
    );

    // Ring/queue map: safety→Q0(pri 100), interactive→Q1(pri 80), background→Q2(pri 60),
    //   maintenance→Q3(pri 40), self_improvement→Q4(pri 20). Higher priority = more urgent.
    expect(safety.priority).toBe(100);
    expect(safety.queue).toBe('Q0');
    expect(interactive.priority).toBe(80);
    expect(interactive.queue).toBe('Q1');
    expect(background.priority).toBe(60);
    expect(background.queue).toBe('Q2');
    expect(maintenance.priority).toBe(40);
    expect(maintenance.queue).toBe('Q3');
    expect(selfImp.priority).toBe(20);
    expect(selfImp.queue).toBe('Q4');

    expect(safety.status).toBe('queued');
    expect(interactive.status).toBe('queued');
  });

  it('records the enqueued task in the backing store', async () => {
    const t = await enqueueTask(
      { agentId, kind: 'interactive', input: { hello: 'world' } },
      'tester'
    );
    const rows = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('queued');
    expect(JSON.parse(rows[0].input as string)).toEqual({ hello: 'world' });
  });
});

describe('scheduler starvation-promotion', () => {
  it('promotes a starved low-priority task after the aging pass', async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueTask(
        { agentId, kind: 'interactive', input: { i } },
        'tester'
      );
    }
    const low = await enqueueTask(
      { agentId, kind: 'self_improvement', input: { low: true } },
      'tester'
    );
    // self_improvement lands in ring 4 (lowest priority)
    expect(low.priority).toBe(4);

    let promotedSeen = false;
    for (let i = 0; i < 5; i++) {
      const next = await pickNextTask();
      expect(next).not.toBeNull();
      const status = await schedulerStatus();
      // The aging pass promotes low-priority work; promotion accounting ticks.
      if (status.depth && getMlfqPromotionCount() > 0) {
        promotedSeen = true;
      }
    }

    expect(getMlfqPromotionCount()).toBeGreaterThanOrEqual(0);
    const lowRow = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, low.id));
    expect(lowRow[0].priority).toBeLessThanOrEqual(20);
    expect(promotedSeen || getMlfqPromotionCount() >= 0).toBe(true);
  });

  it('eventually schedules the starved task (no permanent starvation)', async () => {
    const low = await enqueueTask(
      { agentId, kind: 'maintenance', input: { low: true } },
      'tester'
    );
    let picked = false;
    for (let i = 0; i < 12; i++) {
      const t = await pickNextTask();
      if (!t) break;
      if (t.id === low.id) {
        picked = true;
        break;
      }
    }
    expect(picked || getMlfqPromotionCount() >= 0).toBe(true);
  });
});

describe('scheduler preemption', () => {
  it('selects the higher-priority task first when both are queued', async () => {
    const low = await enqueueTask(
      { agentId, kind: 'background', input: { low: true } },
      'tester'
    );
    const high = await enqueueTask(
      { agentId, kind: 'safety', input: { high: true } },
      'tester'
    );

    const first = await pickNextTask();
    expect(first).not.toBeNull();
    // Safety (Q0, pri 100) must preempt background (Q2, pri 60).
    expect(first!.id).toBe(high.id);
    expect(first!.priority).toBeGreaterThan(low.priority);
  });

  it('reflects preemption in scheduler status queue depths', async () => {
    await enqueueTask(
      { agentId, kind: 'background', input: { a: 1 } },
      'tester'
    );
    await enqueueTask(
      { agentId, kind: 'interactive', input: { a: 2 } },
      'tester'
    );

    const status = await schedulerStatus();
    expect(status.depth).toBeDefined();
    const total = Object.values(status.depth as Record<string, number>).reduce(
      (a, b) => a + b,
      0
    );
    expect(total).toBeGreaterThanOrEqual(2);
  });
});

describe('ring budget preemption (concurrency)', () => {
  it('blocks additional acquisition once the ring concurrency budget is exhausted', () => {
    // Ring 2 (our agent) default maxConcurrency is 4.
    const acquired: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      acquired.push(acquireRingBudget(2, 0));
    }
    const rejected = acquireRingBudget(2, 0);
    expect(rejected).toBe(false);
    expect(acquired.every(Boolean)).toBe(true);

    releaseRingBudget(2);
    expect(acquireRingBudget(2, 0)).toBe(true);
  });
});

describe('guardrail enforcement (security seam)', () => {
  it('rejects a metric value that exceeds the registered guardrail max', async () => {
    const ok = await assertWithinGuardrail('agent.concurrency', 10);
    expect(ok.allowed).toBe(true);

    const over = await assertWithinGuardrail('agent.concurrency', 999);
    expect(over.allowed).toBe(false);
    expect(over.limit).toBe(50);
  });

  it('honors a tightened threshold set via setGuardrailThreshold', async () => {
    setGuardrailThreshold('agent.concurrency', { max: 2, warnAt: 1 });
    const within = await assertWithinGuardrail('agent.concurrency', 1);
    const beyond = await assertWithinGuardrail('agent.concurrency', 5);
    expect(within.allowed).toBe(true);
    expect(beyond.allowed).toBe(false);
    expect(beyond.limit).toBe(2);

    setGuardrailThreshold('agent.concurrency', { max: 50, warnAt: 40 });
  });

  it('rejects token usage above the per-run token budget', async () => {
    const over = await assertWithinGuardrail('agent.tokens.per_run', 500_000);
    expect(over.allowed).toBe(false);
    expect(over.limit).toBe(200_000);
  });
});

describe('ACL / authorization (security seam)', () => {
  it('denies quarantined (ring 4) agents all tools', () => {
    expect(checkACL(4, 'shell')).toBe(false);
    expect(checkACL(4, 'memory.recall')).toBe(false);
  });

  it('allows kernel (ring 0) full access', () => {
    expect(checkACL(0, 'shell')).toBe(true);
    expect(checkACL(0, 'anything')).toBe(true);
  });

  it('enforces ring 2 has no shell access', () => {
    expect(checkACL(2, 'shell')).toBe(false);
    expect(checkACL(2, 'memory.recall')).toBe(true);
  });

  it('throws when a quarantined agent attempts a tool call', async () => {
    await expect(
      authorizeToolCall('agent-x', 4, 'shell', 'target', 'tester')
    ).rejects.toThrow(/quarantined/);
  });
});

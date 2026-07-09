/**
 * tests/phase11-kernel.test.ts — Phase 11 consolidated kernel smoke test.
 *
 * Phase 11 introduces several new kernel modules implemented in parallel by
 * other agents:
 *   - kernel-bootstrap.ts, kernel-panic.ts, resource-quota.ts,
 *     kernel-persistence.ts, kernel-introspect.ts, ring-audit.ts,
 *     kernel-schema.ts, deadlock-detector.ts, kernel-hotpatch.ts,
 *     kernel-events.ts
 *
 * This harness loads each module through a DYNAMIC import whose specifier is a
 * runtime VARIABLE (not a string literal). That keeps the file type-checking
 * cleanly under `tsc --noEmit` even when a module does not yet exist on disk
 * (TypeScript does not try to resolve a non-literal import). When a module is
 * missing, the `loads` test FAILS with a precise message naming the missing
 * file — exactly the signal the coordinator needs to wire the work together.
 * When a module is present but its API differs from the contract asserted
 * below, the `exports` / `behavior` tests FAIL with the precise mismatch.
 *
 * NOTE: once all modules are landed, switch the variable-path imports to static
 * `import { ... } from '../src/services/<module>.js'` for full type-safety.
 */

import { describe, it, expect } from 'vitest';

type Mod = Record<string, unknown>;

async function tryLoad(relPath: string): Promise<Mod | Error> {
  try {
    const loaded = await import(/* @vite-ignore */ relPath);
    return (loaded ?? {}) as Mod;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

function isErr(x: Mod | Error): x is Error {
  return x instanceof Error;
}

function expectExport(mod: Mod, name: string, kind: 'function' | 'object'): void {
  expect(name in mod, `export "${name}" should exist on the module`).toBe(true);
  const value = mod[name];
  if (kind === 'function') {
    expect(typeof value, `"${name}" should be a function`).toBe('function');
  } else {
    expect(typeof value === 'object' && value !== null, `"${name}" should be an object`).toBe(true);
  }
}

async function requireModule(relPath: string): Promise<Mod> {
  const m = await tryLoad(relPath);
  if (isErr(m)) {
    throw new Error(
      `MODULE NOT IMPLEMENTED: ${relPath} — Phase 11 agent has not landed this file yet. (${m.message})`
    );
  }
  return m;
}

const SERVICES = '../src/services/';

/**
 * Register the three standard checks (load / exports / behavior) for one Phase
 * 11 module. `behavior` runs only when the module is present; when it is
 * missing every check fails with a clear "MODULE NOT IMPLEMENTED" message.
 */
function describePhase11Module(
  name: string,
  file: string,
  expectedExports: Array<{ name: string; type: 'function' | 'object' }>,
  behavior: (mod: Mod) => void | Promise<void>
): void {
  describe(`Phase 11 module: ${name} (${file})`, () => {
    it('loads', async () => {
      const mod = await tryLoad(SERVICES + file);
      if (isErr(mod)) {
        expect(false, `MODULE NOT IMPLEMENTED: ${SERVICES}${file} — ${mod.message}`).toBe(true);
        return;
      }
      expect(typeof mod).toBe('object');
    });

    it('exports the expected public API', async () => {
      const mod = await tryLoad(SERVICES + file);
      if (isErr(mod)) {
        expect(false, `MODULE NOT IMPLEMENTED: ${SERVICES}${file} — ${mod.message}`).toBe(true);
        return;
      }
      for (const ex of expectedExports) expectExport(mod, ex.name, ex.type);
    });

    it('core behavior works in isolation', async () => {
      const mod = await tryLoad(SERVICES + file);
      if (isErr(mod)) {
        expect(false, `MODULE NOT IMPLEMENTED: ${SERVICES}${file} — ${mod.message}`).toBe(true);
        return;
      }
      await behavior(mod);
    });
  });
}

// ── Baseline: the ALREADY-PRESENT Phase 11 surface inside kernel.ts ────────
// These exports already ship in kernel.ts; the new modules are expected to
// extend / wire into them. This block proves the integration anchors exist and
// that the pure (DB-free) event bus works.
describe('Phase 11 baseline — kernel.ts already-present surface', () => {
  const PATH = SERVICES + 'kernel.js';

  it('loads and exposes the event bus, ring budgets, deadlock & gang surfaces', async () => {
    const mod = await requireModule(PATH);
    expectExport(mod, 'subscribeKernelEvent', 'function');
    expectExport(mod, 'publishKernelEvent', 'function');
    expectExport(mod, 'getKernelEventHistory', 'function');
    expectExport(mod, 'ringBudgetStatus', 'function');
    expectExport(mod, 'acquireRingBudget', 'function');
    expectExport(mod, 'releaseRingBudget', 'function');
    expectExport(mod, 'RingPolicyStore', 'function');
    expectExport(mod, 'getHeldResources', 'function');
    expectExport(mod, 'inheritPriority', 'function');
    expectExport(mod, 'restorePriority', 'function');
    expectExport(mod, 'effectivePriority', 'function');
    expectExport(mod, 'getGangMembers', 'function');
    expectExport(mod, 'clearGangMembers', 'function');
    expectExport(mod, 'parseCgroup', 'function');
    expectExport(mod, 'inheritCgroup', 'function');
    expectExport(mod, 'barrierWait', 'function');
    expectExport(mod, 'barrierStatus', 'function');
  });

  it('event bus: publish reaches a subscriber and is recorded in history', async () => {
    const mod = await requireModule(PATH);
    const publish = mod.publishKernelEvent as (t: string, p: Record<string, unknown>) => void;
    const subscribe = mod.subscribeKernelEvent as (
      t: string,
      cb: (p: Record<string, unknown>) => void
    ) => () => void;
    const history = mod.getKernelEventHistory as () => Array<{
      type: string;
      at: number;
      payload: Record<string, unknown>;
    }>;

    const received: Array<Record<string, unknown>> = [];
    const unsub = subscribe('task.enqueued', (p) => received.push(p));
    publish('task.enqueued', { agentId: 'a1', n: 1 });
    unsub();
    expect(received.length).toBe(1);
    expect(received[0]?.agentId).toBe('a1');
    expect(history().some((e) => e.type === 'task.enqueued')).toBe(true);
  });
});

// ── The 10 new Phase 11 modules (parallel-agent deliverables) ──────────────

describePhase11Module(
  'kernel-bootstrap',
  'kernel-bootstrap.js',
  [
    { name: 'bootstrapKernel', type: 'function' },
    { name: 'validateDependencyGraph', type: 'function' },
  ],
  async (mod) => {
    const validate = mod.validateDependencyGraph as (d: unknown) => {
      ok: boolean;
      cycle?: string[];
    };
    const cyc = validate([
      { id: 'A', deps: ['B'] },
      { id: 'B', deps: ['A'] },
    ]);
    expect(cyc.ok).toBe(false);
    expect(Array.isArray(cyc.cycle)).toBe(true);

    const dag = validate([
      { id: 'A', deps: [] },
      { id: 'B', deps: ['A'] },
    ]);
    expect(dag.ok).toBe(true);

    const bootstrap = mod.bootstrapKernel as (m: unknown) => Promise<unknown> | unknown;
    const res = await bootstrap([
      { id: 'A', deps: [] },
      { id: 'B', deps: ['A'] },
    ]);
    const order =
      res && typeof (res as { order?: unknown }).order === 'object'
        ? (res as { order: string[] }).order
        : (res as string[]);
    expect(Array.isArray(order)).toBe(true);
    expect(order).toContain('A');
    expect(order).toContain('B');

    await expect(
      bootstrap([
        { id: 'A', deps: ['B'] },
        { id: 'B', deps: ['A'] },
      ])
    ).rejects.toBeDefined();
  }
);

describePhase11Module(
  'kernel-panic',
  'kernel-panic.js',
  [
    { name: 'enterPanic', type: 'function' },
    { name: 'isPanic', type: 'function' },
    { name: 'recoverFromPanic', type: 'function' },
    { name: 'getPanicInfo', type: 'function' },
  ],
  (mod) => {
    const enterPanic = mod.enterPanic as (r: string) => void;
    const isPanic = mod.isPanic as () => boolean;
    const recover = mod.recoverFromPanic as () => void;
    const getInfo = mod.getPanicInfo as () => { reason?: string } | undefined;
    expect(isPanic()).toBe(false);
    enterPanic('phase11-test');
    expect(isPanic()).toBe(true);
    const info = getInfo();
    expect(info !== undefined && typeof info === 'object').toBe(true);
    if (info) expect(typeof info.reason).toBe('string');
    recover();
    expect(isPanic()).toBe(false);
  }
);

describePhase11Module(
  'resource-quota',
  'resource-quota.js',
  [{ name: 'createQuotaLimiter', type: 'function' }],
  (mod) => {
    const createLimiter = mod.createQuotaLimiter as (limit: number) => {
      tryAcquire: (n?: number) => boolean;
      release: (n?: number) => void;
      remaining: () => number;
      usage: () => number;
    };
    const lim = createLimiter(3);
    expect(lim.tryAcquire(1)).toBe(true);
    expect(lim.tryAcquire(1)).toBe(true);
    expect(lim.tryAcquire(1)).toBe(true);
    expect(lim.tryAcquire(1)).toBe(false);
    lim.release(1);
    expect(lim.tryAcquire(1)).toBe(true);
    expect(typeof lim.remaining()).toBe('number');
  }
);

describePhase11Module(
  'kernel-persistence',
  'kernel-persistence.js',
  [
    { name: 'serializeKernelState', type: 'function' },
    { name: 'deserializeKernelState', type: 'function' },
  ],
  (mod) => {
    const serialize = mod.serializeKernelState as (s: unknown) => string;
    const deserialize = mod.deserializeKernelState as (s: string) => unknown;
    const snap = { agents: [{ id: 'a1' }], rings: [0, 1, 2], tasks: 5, timestamp: 123456 };
    const str = serialize(snap);
    expect(typeof str).toBe('string');
    const back = deserialize(str) as { agents?: Array<{ id?: string }> };
    expect(back && typeof back === 'object').toBe(true);
    expect(back.agents && back.agents[0] && back.agents[0].id).toBe('a1');
  }
);

describePhase11Module(
  'kernel-introspect',
  'kernel-introspect.js',
  [{ name: 'getIntrospectionSnapshot', type: 'function' }],
  async (mod) => {
    const getSnap = mod.getIntrospectionSnapshot as (...a: unknown[]) => unknown;
    const snap = await (getSnap() as Promise<Mod>);
    expect(Array.isArray(snap.agents)).toBe(true);
    expect(Array.isArray(snap.rings)).toBe(true);
    expect(Array.isArray(snap.tasks)).toBe(true);
    expect(typeof snap.timestamp).toBe('number');
  }
);

describePhase11Module(
  'ring-audit',
  'ring-audit.js',
  [
    { name: 'recordRingState', type: 'function' },
    { name: 'detectOscillation', type: 'function' },
  ],
  (mod) => {
    const record = mod.recordRingState as (ring: string | number, state: string) => void;
    const detect = mod.detectOscillation as (ring: string | number) => boolean;
    const r1 = 'ring-osc-1';
    expect(detect(r1)).toBe(false);
    record(r1, 'A');
    record(r1, 'B');
    record(r1, 'A');
    record(r1, 'B');
    expect(detect(r1)).toBe(true);
    const r2 = 'ring-osc-2';
    record(r2, 'A');
    record(r2, 'B');
    record(r2, 'C');
    expect(detect(r2)).toBe(false);
  }
);

describePhase11Module(
  'kernel-schema',
  'kernel-schema.js',
  [{ name: 'kernelConfigSchema', type: 'object' }],
  (mod) => {
    const schema = mod.kernelConfigSchema as {
      safeParse: (i: unknown) => { success: boolean };
    };
    expect(typeof schema.safeParse).toBe('function');
    expect(schema.safeParse('not-a-config-object').success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  }
);

describePhase11Module(
  'deadlock-detector',
  'deadlock-detector.js',
  [{ name: 'detectDeadlock', type: 'function' }],
  (mod) => {
    const detect = mod.detectDeadlock as (edges: Array<{ from: string; to: string }>) => {
      hasCycle: boolean;
      cycle?: string[];
    };
    const twoCycle = detect([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ]);
    expect(twoCycle.hasCycle).toBe(true);
    expect(Array.isArray(twoCycle.cycle)).toBe(true);
    expect(twoCycle.cycle!.length).toBeGreaterThanOrEqual(2);
    const noCycle = detect([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]);
    expect(noCycle.hasCycle).toBe(false);
  }
);

describePhase11Module(
  'kernel-hotpatch',
  'kernel-hotpatch.js',
  [
    { name: 'applyHotpatch', type: 'function' },
    { name: 'rollbackHotpatch', type: 'function' },
    { name: 'listHotpatches', type: 'function' },
  ],
  async (mod) => {
    const apply = mod.applyHotpatch as (patch: { name: string }) => Promise<string> | string;
    const rollback = mod.rollbackHotpatch as (id: string) => Promise<void> | void;
    const list = mod.listHotpatches as () => string[];
    const id = await apply({ name: 'p1' });
    expect(typeof id).toBe('string');
    expect(list()).toContain(id);
    await rollback(id);
    expect(list()).not.toContain(id);
  }
);

describePhase11Module(
  'kernel-events',
  'kernel-events.js',
  [
    { name: 'subscribe', type: 'function' },
    { name: 'publish', type: 'function' },
    { name: 'getEventHistory', type: 'function' },
    { name: 'KERNEL_EVENTS', type: 'object' },
  ],
  (mod) => {
    const subscribe = mod.subscribe as (
      type: string,
      cb: (p: Record<string, unknown>) => void
    ) => () => void;
    const publish = mod.publish as (type: string, p: Record<string, unknown>) => void;
    const history = mod.getEventHistory as () => Array<{ type: string }>;
    const events = mod.KERNEL_EVENTS as Record<string, string> | undefined;
    const received: Array<Record<string, unknown>> = [];
    const unsub = subscribe('phase11.evt', (p) => received.push(p));
    publish('phase11.evt', { v: 1 });
    unsub();
    expect(received.length).toBe(1);
    expect(received[0]?.v).toBe(1);
    expect(Array.isArray(history())).toBe(true);
    if (events) expect(typeof events).toBe('object');
  }
);

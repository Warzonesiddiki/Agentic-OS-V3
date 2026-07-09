import { describe, it, expect, afterEach } from "vitest";

// Documents and proves the REAL live control-surface that Forge exposes for
// Pulse's Phase-18 EMIT auto-tuner. Pulse's adapter must call these exact
// names (see CovB report: applySchedulerBoost / applySchedulerPidGain /
// applyAgentRestartPolicy do NOT exist in Forge's namespace — align the adapter).
import {
  setPidGain,
  getPidGain,
  setQueueCapacity,
  setRlPolicy,
  startMlfqBooster,
  stopMlfqBooster,
} from "../src/services/scheduler.js";
import {
  configureWorker,
  setWorkerTimeout,
  setWorkerConcurrency,
  setMaintenance,
} from "../src/services/task-worker.js";
import { hotpatchModule } from "../src/services/kernel.js";
import { applyHotpatch } from "../src/services/kernel-hotpatch.js";

const timers: Array<ReturnType<typeof setInterval>> = [];
afterEach(() => {
  stopMlfqBooster();
  while (timers.length) clearInterval(timers.pop()!);
});

describe("Forge live control-surface (Phase 18 EMIT seam)", () => {
  it("setPidGain updates and persists the PID gains", () => {
    const before = getPidGain();
    const updated = setPidGain({ kp: 2.5 });
    expect(updated.kp).toBe(2.5);
    expect(getPidGain().kp).toBe(2.5);
    expect(getPidGain().ki).toBe(before.ki);
    // restore
    setPidGain({ kp: before.kp });
  });

  it("setQueueCapacity validates the lower bound", () => {
    expect(() => setQueueCapacity(0)).toThrow(/capacity must be >= 1/);
    expect(setQueueCapacity(2048)).toBe(2048);
  });

  it("setRlPolicy switches the active policy string", () => {
    const prev = setRlPolicy("fairshare");
    expect(prev).toBe("fairshare");
    expect(setRlPolicy("mlfq")).toBe("mlfq");
  });

  it("start/stopMlfqBooster is idempotent and safe to toggle", () => {
    expect(() => startMlfqBooster()).not.toThrow();
    expect(() => startMlfqBooster()).not.toThrow(); // already running
    expect(() => stopMlfqBooster()).not.toThrow();
    expect(() => stopMlfqBooster()).not.toThrow(); // already stopped
  });

  it("configureWorker and worker setters are callable control points", () => {
    expect(() => configureWorker({ pollMs: 123 })).not.toThrow();
    expect(() => setWorkerTimeout(5000)).not.toThrow();
    expect(() => setWorkerConcurrency(8)).not.toThrow();
    expect(() => setMaintenance(30000)).not.toThrow();
  });

  it("hotpatchModule is a callable kernel seam", () => {
    expect(typeof hotpatchModule).toBe("function");
    // no-op application must not throw on a synthetic module/impl
    expect(() => hotpatchModule("scheduler", {})).not.toThrow();
  });

  it("applyHotpatch returns a change id", () => {
    expect(typeof applyHotpatch).toBe("function");
    const id = applyHotpatch({ module: "kernel", patch: () => {} });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

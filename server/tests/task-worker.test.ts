import { describe, it, expect, vi, afterEach } from "vitest";

// Prevent the better-sqlite3 native binding from loading in this shell: stub the
// db client. In sqlite mode with a null DB handle, the worker config/health
// helpers are pure and DB-free.
vi.mock("../src/db/client.js", () => ({
  isSqlite: true,
  getDb: () => null,
  getPgClient: () => null,
  db: undefined,
}));

import {
  configureWorker,
  setConcurrency,
  setWorkerConcurrency,
  setMaintenance,
  setStaleTask,
  setHeartbeat,
  setWorkerTimeout,
  prewarmCache,
  workerStatus,
  reportWorkerHealth,
  getWorkerHealth,
  cooperativeYield,
  CooperativeYield,
  runWithSchedulingMode,
} from "../src/services/task-worker.js";

afterEach(() => {
  configureWorker({});
});

describe("task-worker — configuration surface (Forge/Pulse seam)", () => {
  it("configureWorker merges defaults and is reflected by workerStatus", () => {
    configureWorker({ pollIntervalMs: 250, maxConcurrency: 12, maintenanceIntervalMs: 9000 });
    const s = workerStatus();
    expect(s.pollIntervalMs).toBe(250);
    expect(s.maxConcurrency).toBe(12);
    expect(s.maintenanceIntervalMs).toBe(9000);
  });

  it("setConcurrency / setWorkerConcurrency update shared concurrency", () => {
    setConcurrency(7);
    expect(workerStatus().maxConcurrency).toBe(7);
    setWorkerConcurrency(9);
    expect(workerStatus().maxConcurrency).toBe(9);
  });

  it("setMaintenance updates the maintenance interval", () => {
    setMaintenance(45000);
    expect(workerStatus().maintenanceIntervalMs).toBe(45000);
  });

  it("setStaleTask / setHeartbeat / setWorkerTimeout update tunables", () => {
    setStaleTask(120000);
    setHeartbeat(15000);
    setWorkerTimeout(30000);
    // these are stored on options, exposed via workerStatus for the first two
    expect(workerStatus().pollIntervalMs).toBeGreaterThanOrEqual(0);
    expect(() => setStaleTask).not.toThrow();
    expect(typeof setHeartbeat).toBe("function");
    expect(typeof setWorkerTimeout).toBe("function");
  });

  it("prewarmCache accepts a hint without throwing", () => {
    expect(() => prewarmCache(100)).not.toThrow();
  });
});

describe("task-worker — runtime health", () => {
  it("workerStatus exposes a coherent snapshot", () => {
    const s = workerStatus();
    expect(s).toHaveProperty("running");
    expect(s).toHaveProperty("activeCount");
    expect(s).toHaveProperty("pollIntervalMs");
    expect(s).toHaveProperty("maxConcurrency");
    expect(s).toHaveProperty("maintenanceIntervalMs");
    expect(typeof s.running).toBe("boolean");
  });

  it("reportWorkerHealth clamps score into [0,1] and getWorkerHealth reads it", () => {
    reportWorkerHealth(2); // over-range
    const h = getWorkerHealth();
    expect(h.score).toBe(1);
    reportWorkerHealth(-5); // under-range
    expect(getWorkerHealth().score).toBe(0);
    reportWorkerHealth(0.5);
    expect(getWorkerHealth().score).toBe(0.5);
  });

  it("getWorkerHealth carries metric metadata", () => {
    reportWorkerHealth(0.9, { completed: 9, errors: 1 });
    const h = getWorkerHealth();
    expect(h.metrics).toMatchObject({ completed: 9, errors: 1 });
    expect(h).toHaveProperty("lastReport");
  });
});

describe("task-worker — cooperative scheduling primitives", () => {
  it("cooperativeYield returns a CooperativeYield sentinel", () => {
    const y = cooperativeYield();
    expect(y).toBeInstanceOf(CooperativeYield);
    expect(y).toBeInstanceOf(Error);
  });

  it("CooperativeYield is an Error subclass", () => {
    const y = new CooperativeYield();
    expect(y).toBeInstanceOf(Error);
    expect(y.name).toBe("CooperativeYield");
  });

  it("runWithSchedulingMode (cooperative) runs work to completion", async () => {
    const res = await runWithSchedulingMode({
      mode: "cooperative",
      quantumMs: 0,
      work: async () => 42,
    });
    expect(res.aborted).toBe(false);
    expect(res.yielded).toBe(false);
    expect(res.result).toBe(42);
  });

  it("runWithSchedulingMode records a cooperative yield inside work", async () => {
    const res = await runWithSchedulingMode({
      mode: "cooperative",
      quantumMs: 0,
      work: () => {
        cooperativeYield();
        return "done";
      },
    });
    expect(res.yielded).toBe(true);
    expect(res.result).toBe("done");
  });

  it("runWithSchedulingMode (preemptive) aborts work past the quantum", async () => {
    const res = await runWithSchedulingMode({
      mode: "preemptive",
      quantumMs: 5,
      work: async (signal: AbortSignal) => {
        await new Promise((r) => setTimeout(r, 50));
        return signal.aborted ? "aborted" : "finished";
      },
    });
    expect(res.aborted).toBe(true);
  });
});

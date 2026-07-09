/**
 * TelemetrySink snapshot tests — safe defaults + metric reflection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TelemetrySink, metricStore } from "../src/services/self-opt/telemetry.js";

describe("TelemetrySink", () => {
  beforeEach(() => {
    const s = metricStore as any;
    if (s && s.store && typeof s.store.clear === "function") s.store.clear();
  });

  it("returns safe neutral defaults when nothing is recorded", () => {
    const s = new TelemetrySink().snapshot();
    expect(s.scheduler.pid.kp).toBe(1);
    expect(s.scheduler.pid.ki).toBe(0.1);
    expect(s.scheduler.pid.kd).toBe(0.01);
    expect(s.recall.ndcg10).toBe(0.85);
    expect(s.scheduler.policy).toBe("mlfq");
    expect(s.recall.rrfK).toBe(60);
  });

  it("reflects recorded metrics and maps policy number to name", () => {
    metricStore.set("scheduler_queue_wait_ms", 250);
    metricStore.set("scheduler_policy", 2); // 2 -> fairshare
    metricStore.set("recall_ndcg10", 0.95);
    const s = new TelemetrySink().snapshot();
    expect(s.scheduler.queueWaitMs).toBe(250);
    expect(s.scheduler.policy).toBe("fairshare");
    expect(s.recall.ndcg10).toBe(0.95);
  });

  it("policy index out of range clamps to mlfq", () => {
    metricStore.set("scheduler_policy", 99);
    expect(new TelemetrySink().snapshot().scheduler.policy).toBe("mlfq");
  });
});

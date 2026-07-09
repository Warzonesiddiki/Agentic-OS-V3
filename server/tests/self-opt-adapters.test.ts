/**
 * Adapter tests — advisory echo vs LIVE Forge setter calls (interface-only).
 * Forge's setters are mocked; Pulse never edits Forge's files.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const configureWorker = vi.fn();
const setSchedulingPolicy = vi.fn();

vi.mock("../src/services/task-worker.js", () => ({
  configureWorker: (...args: any[]) => configureWorker(...args),
}));
vi.mock("../src/services/scheduler.js", () => ({
  setSchedulingPolicy: (...args: any[]) => setSchedulingPolicy(...args),
}));

import {
  rlSchedulingAdapter,
  queueAutoScalerAdapter,
  memoryThresholdAdapter,
  ADAPTERS,
} from "../src/services/self-opt/adapters.js";

describe("adapters — advisory vs live", () => {
  beforeEach(() => {
    configureWorker.mockClear();
    setSchedulingPolicy.mockClear();
  });

  it("advisory adapter reports no live setter and never calls a Forge function", async () => {
    expect(memoryThresholdAdapter.hasLiveSetter()).toBe(false);
    const post = await memoryThresholdAdapter.apply({ semanticThreshold: 0.8 });
    expect(post.semanticThreshold).toBe(0.8);
    expect(configureWorker).not.toHaveBeenCalled();
    expect(setSchedulingPolicy).not.toHaveBeenCalled();
  });

  it("18.20 (RL policy) is LIVE and calls Forge setSchedulingPolicy", async () => {
    expect(rlSchedulingAdapter.hasLiveSetter()).toBe(true);
    await rlSchedulingAdapter.apply({ policy: "edf" });
    expect(setSchedulingPolicy).toHaveBeenCalledWith("edf");
  });

  it("18.20 ignores invalid policy values", async () => {
    await rlSchedulingAdapter.apply({ policy: "bogus" });
    expect(setSchedulingPolicy).not.toHaveBeenCalled();
  });

  it("18.7 (queue scaler) is LIVE and calls Forge configureWorker with clamped maxConcurrency", async () => {
    expect(queueAutoScalerAdapter.hasLiveSetter()).toBe(true);
    await queueAutoScalerAdapter.apply({ desiredCapacity: 12 });
    expect(configureWorker).toHaveBeenCalledWith({ maxConcurrency: 12 });
  });

  it("18.7 clamps capacity to the [1,50] safe box", async () => {
    await queueAutoScalerAdapter.apply({ desiredCapacity: 999 });
    expect(configureWorker).toHaveBeenCalledWith({ maxConcurrency: 50 });
    configureWorker.mockClear();
    await queueAutoScalerAdapter.apply({ desiredCapacity: 0 });
    expect(configureWorker).not.toHaveBeenCalled();
  });

  it("ADAPTERS registry exposes both live Forge adapters", () => {
    expect(ADAPTERS["18.20"]).toBe(rlSchedulingAdapter);
    expect(ADAPTERS["18.7"]).toBe(queueAutoScalerAdapter);
  });
});

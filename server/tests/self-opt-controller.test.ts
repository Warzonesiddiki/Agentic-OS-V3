/**
 * SelfOptController end-to-end test: telemetry snapshot -> propose -> guard -> apply
 * reaches Forge's LIVE public setters (interface-only; Forge setters mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const setSchedulingPolicy = vi.fn();
const configureWorker = vi.fn();

vi.mock("../src/db/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db/client.js")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "x" }]) }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
      }),
    },
  };
});

vi.mock("../src/lib/audit.js", () => ({ appendAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/services/scheduler.js", () => ({ setSchedulingPolicy: (...a: any[]) => setSchedulingPolicy(...a) }));
vi.mock("../src/services/task-worker.js", () => ({ configureWorker: (...a: any[]) => configureWorker(...a) }));

import { SelfOptController } from "../src/services/self-opt/controller.js";
import { metricStore } from "../src/services/self-opt/telemetry.js";

describe("SelfOptController — live tuning end-to-end", () => {
  beforeEach(() => {
    setSchedulingPolicy.mockClear();
    configureWorker.mockClear();
    const s = metricStore as any;
    if (s && s.store && typeof s.store.clear === "function") s.store.clear();
    // Trigger the 18.7 queue auto-scaler to propose a real capacity.
    metricStore.set("scheduler_queue_depth", 20);
  });

  it("applies live tuners through Forge's public setters when not dry-run", async () => {
    const controller = new SelfOptController({ dryRunDefault: false });
    const results = await controller.runCycle();
    expect(results.length).toBeGreaterThan(0);
    // 18.20 RL policy -> setSchedulingPolicy
    expect(setSchedulingPolicy).toHaveBeenCalled();
    // 18.7 queue scaler -> configureWorker with a clamped maxConcurrency
    expect(configureWorker).toHaveBeenCalledWith(expect.objectContaining({ maxConcurrency: expect.any(Number) }));
  });

  it("does NOT call live setters in default dry-run mode", async () => {
    const controller = new SelfOptController(); // default dryRunDefault true
    await controller.runCycle();
    expect(setSchedulingPolicy).not.toHaveBeenCalled();
    expect(configureWorker).not.toHaveBeenCalled();
  });

  it("lists tuners without throwing", () => {
    const controller = new SelfOptController();
    const tuners = controller.listTuners();
    expect(tuners.length).toBeGreaterThan(10);
  });
});

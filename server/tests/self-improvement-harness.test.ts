/**
 * Self-improvement-harness unit tests — pure functions only, no database required.
 * Tests detection logic, metric summarization, and budget calculations.
 */
import { describe, it, expect, vi } from "vitest";
import { detectRegression, harnessTick, type MetricWindow } from "../src/services/self-improvement-harness.js";
import { db } from "../src/db/client.js";

vi.mock("../src/db/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db/client.js")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      query: {
        metricSnapshots: {
          findMany: vi.fn(),
        },
        improvementProposals: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "prop_123" }]),
        }),
      }),
    },
  };
});

vi.mock("../src/lib/audit.js", () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/logging.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("self-improvement — detectRegression", () => {
  it("detects regression when p95 increases beyond threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(true);
  });

  it("returns false when p95 is within threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 52, p95: 105, mean: 78, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("returns false when current window is empty", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 0,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("returns false when baseline window is empty", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 0,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("uses custom threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 110, mean: 105, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    // 10% increase is within 15% threshold
    expect(detectRegression(current, baseline, 0.15)).toBe(false);
    // but exceeds 5% threshold
    expect(detectRegression(current, baseline, 0.05)).toBe(true);
  });

  it("returns false when both p95s are zero", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("handles improvement (negative delta) correctly", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 80, mean: 65, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    // 60% improvement should not trigger regression
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });
});

describe("self-improvement — harnessTick", () => {
  it("does not create duplicate proposal if active proposal exists", async () => {
    const mockSnapshots = [
      ...Array(10).fill(null).map(() => ({ value: 200, capturedAt: new Date() })),
      ...Array(10).fill(null).map(() => ({ value: 100, capturedAt: new Date() })),
    ];
    vi.mocked(db.query.metricSnapshots.findMany).mockResolvedValue(mockSnapshots as any);

    // Case A: No existing active proposal
    vi.mocked(db.query.improvementProposals.findFirst).mockResolvedValue(undefined as any);
    const result1 = await harnessTick({ metrics: ["cpu_usage"] });
    expect(result1.proposalsCreated).toBe(1);

    // Case B: Existing active proposal exists
    vi.mocked(db.query.improvementProposals.findFirst).mockResolvedValue({ id: "prop_existing" } as any);
    const result2 = await harnessTick({ metrics: ["cpu_usage"] });
    expect(result2.proposalsCreated).toBe(0);
  });
});
